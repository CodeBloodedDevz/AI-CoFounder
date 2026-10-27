// The assistant's brain, shared by the typed chat and Live Voice:
// the business snapshot + language rules + tools, run in a loop until the
// model has an answer. Everything the user is told about an action comes
// from the verified tool results, never from the model's imagination.

const llm = require('./llm');
const { TOOLS, WRITE_TOOLS, runTool } = require('./assistantTools');
const { findProductByName } = require('./stock');
const { normalizeLang, languageName } = require('./languages');
const { buildSystemPrompt } = require('./chatContext');
const { stripSpeechMeta } = require('./speechMeta');

const MAX_ROUNDS = 4; // model calls per turn (3 rounds of tools + the final answer)

// delete confirmations wait here between two separate requests
const pending = new Map();
// what a voice turn has already done, so a re-sent (merged) turn doesn't repeat it
const turnLog = new Map();
const TURN_LOG_TTL = 2 * 60_000;
function rememberTurn(turnId, businessId, actions) {
  if (!turnId) return;
  turnLog.set(turnId, { businessId, actions, at: Date.now() });
  for (const [k, v] of turnLog) if (Date.now() - v.at > TURN_LOG_TTL) turnLog.delete(k);
  if (turnLog.size > 500) turnLog.delete(turnLog.keys().next().value);
}
const doneEarlier = (turnId, businessId) => {
  const t = turnId && turnLog.get(turnId);
  return t && t.businessId === businessId && Date.now() - t.at < TURN_LOG_TTL ? t.actions : [];
};

const AGENT_RULES = [
  '',
  'ACTIONS (you now have tools that change real records)',
  '- When the user asks you to add, record, change, schedule or delete something, CALL THE TOOL. Never just say you did it. Never claim success unless the tool result in THIS turn says ok:true and verified:true.',
  '- Pull the details out of what they said: product names exactly as spoken, quantities, prices in rand ("R8", "8 rand", "eight rand"). "Bought price"/"cost price" is what the owner PAID per unit (unit_cost). "Selling price" is what customers pay.',
  '- If a required detail is missing or unclear, DO NOT guess and DO NOT call the tool: ask ONE short question for exactly what is missing. If a tool answers with "missing", ask the user for those details.',
  '- If a tool fails, say plainly what went wrong and what the user can do (for example check the Stock screen, or say it again with the missing detail). Never pretend it worked.',
  '- After a successful tool, confirm in one natural sentence with the real numbers from the tool result, e.g. "I\'ve added Snacks: 200 units at R8 each."',
  '- Deleting needs confirmation: ask first, and only call delete_record again after the user says yes in their NEXT message.',
  '- If several records match a name, list the options and ask which one.',
];

function languageRules({ voice, pinned, sticky, from }) {
  const lines = [''];
  lines.push('LANGUAGE');
  if (pinned) {
    lines.push(`- The user chose ${languageName(pinned)} for replies. Always reply in ${languageName(pinned)}, whatever language they speak.`);
  } else if (sticky) {
    lines.push(`- The user asked you to speak ${languageName(sticky)}. Reply in ${languageName(sticky)} until they ask for another language.`);
  } else {
    lines.push('- Work out the language of the user\'s LATEST message yourself and reply in that same language. If they switch language mid-conversation, switch with them straight away; never ask them to repeat. The app interface language (see LANGUAGES above) is only the fallback when the language of the message is unclear: it is not the language being spoken and not a translation request.');
  }
  lines.push('- If the user asks you to speak or reply in a language ("speak Afrikaans"), call set_language. Use language "auto" to go back to matching them.');
  lines.push('- Understand code-switching (e.g. English mixed with Zulu or Afrikaans words) and speech-recognition mistakes; use the business data (product and customer names) to correct misheard words.');
  if (voice) {
    lines.push(`- Speech recognition guessed the language as: ${from ? languageName(from) : 'unknown'}. It is often wrong on short phrases, so trust the words themselves.`);
    lines.push('- START your final answer with a tag in exactly this form: [user=xx reply=yy] where xx is the ISO 639-1 code of the language the user spoke and yy the code of the language you reply in (en, af, zu, xh, st, tn, sw, sn, pt, fr, es, de ...). Then the spoken answer on the same line. Write the tag exactly like that, only once, only at the very start, and never mention languages or tags in the answer itself. The tag is removed before anyone sees it.');
  }
  return lines.join('\n');
}

// Reads and removes the language tag the model puts first ("[user=en reply=af]"), including the variants
// models produce ("[en reply=en]", "(user: en, reply: af)", ...): see lib/speechMeta.js.
function splitLanguageTag(text) {
  const r = stripSpeechMeta(text);
  return { text: r.text, userLang: normalizeLang(r.userLang), replyLang: normalizeLang(r.replyLang) };
}

const parseArgs = (raw) => {
  if (raw && typeof raw === 'object') return raw;
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return null;
  }
};

/**
 * @param {object} o
 * @param {object} o.business  the business row
 * @param {object} o.data      business snapshot for the prompt (see routes/ai.js)
 * @param {Array}  o.history   prior turns [{role, content}]
 * @param {string} o.text      what the user just said / typed
 * @param {boolean} o.voice    spoken reply + language tag
 * @param {string} [o.pinned]  language the user fixed for replies
 * @param {string} [o.sticky]  language chosen earlier in this conversation
 * @param {string} [o.from]    language speech recognition guessed
 * @param {string} [o.turnId]  / o.supersedes  ids for de-duplicating re-sent voice turns
 * @param {() => boolean} [o.isCancelled] true once the client has gone away
 * @returns {{ reply, userLang, replyLang, sticky, actions, changed, toolsUsed }}
 */
async function runAgent({ business, data, history = [], text, voice = false, pinned = null, sticky = null, from = null, turnId, supersedes, requestId, isCancelled = () => false, model, maxTokens, extraSystem = '' }) {
  const businessId = business.id;
  const ctx = {
    businessId,
    requestId: requestId || `${Date.now()}-${Math.random()}`,
    pending,
    findProduct: (name) => findProductByName(businessId, name),
  };

  const earlier = doneEarlier(supersedes, businessId);
  const system = [
    buildSystemPrompt(data, new Date(), { canAct: true }),
    AGENT_RULES.join('\n'),
    languageRules({ voice, pinned, sticky, from }),
    extraSystem,
  ];
  if (earlier.length) {
    system.push(
      '',
      'ALREADY DONE: the user\'s previous message was extended by their next one. These actions had already been carried out. Do NOT repeat them; if the longer message changes a detail, use an update tool instead:',
      ...earlier.map((a) => `- ${a.tool}: ${a.summary || a.error}`)
    );
  }

  const messages = [{ role: 'system', content: system.join('\n') }, ...history, { role: 'user', content: text }];
  const actions = [];
  const changed = new Set();
  let stickyOut = sticky;
  let final = '';
  let toolFormatRetries = 0;

  // The best available models for this kind of turn (configured first, checked against the models this Groq
  // account actually has). If one is rate limited / unavailable the next takes over for the rest of the turn;
  // if even the tool request is rejected, answer the question without actions rather than failing.
  const models = await llm.modelCandidates(voice ? 'voice' : 'chat', model);
  let modelIdx = 0;
  let toolsOff = false;
  const noToolsNote = '\n\nNOTE: your action tools are unavailable for this message. If the user asks you to add, change, record, schedule or delete anything, say honestly that you could not do it right now and that nothing was changed, and tell them to try again in a moment. Questions can still be answered normally.';
  let noteAdded = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const lastRound = round === MAX_ROUNDS - 1;
    let msg;
    try {
      msg = await llm.chatWithTools({
        messages,
        tools: lastRound || toolsOff ? undefined : TOOLS,
        temperature: 0.3,
        maxTokens: maxTokens || (voice ? 320 : 500),
        timeoutMs: 20_000,
        model: models[modelIdx],
      });
    } catch (err) {
      const hard = err.code === 'bad_key' || err.code === 'not_configured';
      console.warn(`[agent] model ${models[modelIdx]} failed (${err.code || 'error'}${err.status ? ` ${err.status}` : ''}): ${err.message}${modelIdx < models.length - 1 ? ` -> trying ${models[modelIdx + 1]}` : ''}`);
      if (hard) throw err;
      // llama sometimes writes a malformed tool call; one more try usually fixes it.
      if (err.status === 400 && /tool|function/i.test(err.message) && toolFormatRetries < 1) {
        toolFormatRetries++;
        round--;
        continue;
      }
      if (modelIdx < models.length - 1) {
        modelIdx++;
        round--;
        continue;
      }
      if (!toolsOff && actions.length === 0 && err.code !== 'timeout') {
        toolsOff = true;
        if (!noteAdded) { messages[0].content += noToolsNote; noteAdded = true; }
        modelIdx = 0;
        round--;
        continue;
      }
      throw err;
    }

    if (!msg.tool_calls.length) {
      final = msg.content;
      break;
    }
    if (isCancelled()) break; // they spoke again: don't change anything on a request nobody is waiting for

    messages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      const name = call.function?.name;
      const args = parseArgs(call.function?.arguments);
      let result;
      if (args === null) result = { ok: false, error: 'The tool arguments were not valid JSON. Try the call again with valid arguments.' };
      else result = await runTool(name, args, ctx);

      if (name === 'set_language' && result.ok) stickyOut = result.language;
      if (result.ok && WRITE_TOOLS.has(name)) (result.changed || []).forEach((t) => changed.add(t));
      if (name !== 'find_records') actions.push({ tool: name, ok: Boolean(result.ok), summary: result.summary || undefined, error: result.ok ? undefined : result.error, missing: result.missing, write: WRITE_TOOLS.has(name) });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 4000) });
    }
    rememberTurn(turnId, businessId, actions.filter((a) => a.ok && a.write));
  }

  if (!final) {
    // Out of rounds (or cancelled): get a plain answer from whatever the tools returned.
    if (isCancelled()) return { reply: '', actions, changed: [...changed], sticky: stickyOut, cancelled: true };
    const msg = await llm.chatWithTools({
      messages: [...messages, { role: 'user', content: 'Now answer the user in one or two short sentences using only the tool results above. If something failed, say so honestly.' }],
      tools: toolsOff ? undefined : TOOLS,
      toolChoice: 'none',
      temperature: 0.2,
      maxTokens: 250,
      timeoutMs: 20_000,
      model: models[modelIdx],
    });
    final = msg.content;
  }

  let userLang = null;
  let replyLang = null;
  // Every reply is cleaned (a typed chat answer can echo a tag it saw in the history, too).
  ({ text: final, userLang, replyLang } = splitLanguageTag(final));
  if (!voice) {
    userLang = null;
    replyLang = null;
  }
  else final = splitLanguageTag(final).text;
  if (!final) throw Object.assign(new Error('The AI returned an empty answer.'), { code: 'empty' });

  return { reply: final, userLang, replyLang, sticky: stickyOut, actions, changed: [...changed] };
}

module.exports = { runAgent, splitLanguageTag, pending, turnLog };
