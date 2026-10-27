// Removes internal language markers and speech-recognition annotations from text people see or hear,
// while keeping every word that was actually said.
//
// Live Voice asks the AI to start its answer with a tag such as "[user=en reply=af]" so the app knows which
// language was spoken and which voice to use. Models sometimes write it differently ("[en reply=en]",
// "(user: en, reply: en)", "user=en reply=en: ...", "[en→af]"), and those variants used to slip through.
// Whisper also adds notes like "[BLANK_AUDIO]" or "(music)" to transcripts.
//
// Only bracketed groups made entirely of language codes and "key=code" pairs are treated as markers (with
// a key, two codes, or at the very start), so ordinary words in brackets ("(two)", "[5 boxes]") stay.

const LANG_CODES = new Set(('en af zu xh st tn nso ss ts ve nr sw sn ny rw lg so am yo ig ha pt fr es de nl ' +
  'zh ar hi ru ja ko tr pl sv da fi el he fa ur bn ta te vi th id ms tl ro hu cs sk uk bg hr sr').split(' '));
const KEY = '(?:user|reply|lang|language|from|to|in|out|spoke|speaker|detected|source|src|target|tgt|input|output|heard|answer)';
const USER_KEYS = /^(user|from|spoke|speaker|detected|source|src|input|heard|in)$/i;
const CODE = '[A-Za-z]{2,3}(?:[-_][A-Za-z]{2,4})?';
const PAIR_RE = new RegExp(`^(?:(${KEY})\\s*[=:]\\s*)?(${CODE})$`, 'i');
const SPLIT_RE = /\s*(?:,|;|\||\/|->|→|=>|>)\s*|\s+/;

const isCode = (c) => LANG_CODES.has(String(c).toLowerCase().split(/[-_]/)[0]);

/** Reads a marker body like "user=en reply=af" / "en reply=en" / "en→af". null when it isn't one. */
function readMarker(body, { atStart }) {
  const tokens = String(body)
    .replace(/\s*([=:])\s*/g, '$1')
    .split(SPLIT_RE)
    .filter(Boolean);
  if (!tokens.length || tokens.length > 4) return null;
  let keyed = 0;
  const langs = { user: null, reply: null };
  const bare = [];
  for (const t of tokens) {
    const m = PAIR_RE.exec(t);
    if (!m || !isCode(m[2])) return null;
    const code = m[2].toLowerCase().split(/[-_]/)[0];
    if (m[1]) {
      keyed += 1;
      if (USER_KEYS.test(m[1])) langs.user = langs.user || code;
      else langs.reply = langs.reply || code;
    } else bare.push(code);
  }
  // A lone "(de)" in the middle of a sentence could be meant; only treat it as a marker at the start.
  if (!keyed && bare.length < 2 && !atStart) return null;
  for (const c of bare) {
    if (!langs.user) langs.user = c;
    else if (!langs.reply) langs.reply = c;
  }
  return langs;
}

const BRACKETED = /[[({<]\s*([^\][(){}<>\n]{1,60}?)\s*[\])}>]/g;
const LEADING_PLAIN = new RegExp(`^\\s*((?:${KEY}\\s*[=:]\\s*${CODE}|${CODE})(?:\\s*[,;| ]\\s*(?:${KEY}\\s*[=:]\\s*${CODE}|${CODE})){0,3})\\s*[:\\-–—]\\s*`, 'i');
// Notes Whisper adds instead of words.
const ASR_NOTES = /[[(]\s*(?:blank[_ ]audio|no speech|silence|music(?: playing)?|applause|laughter|laughs|noise|background noise|inaudible|unintelligible|indistinct|static|beep|coughs?|sighs?|speaking (?:in )?(?:a )?foreign language|foreign language|speaks? \w+)\s*[\])]/gi;

/** -> { text, userLang, replyLang }  (the languages named by the markers it removed) */
function stripSpeechMeta(input) {
  let text = String(input ?? '');
  const langs = { user: null, reply: null };
  const take = (l) => {
    if (!l) return;
    langs.user = langs.user || l.user;
    langs.reply = langs.reply || l.reply;
  };
  // "user=en reply=af: Hello" without brackets, at the start only.
  const lead = LEADING_PLAIN.exec(text);
  if (lead && /[=:]/.test(lead[1])) {
    const l = readMarker(lead[1], { atStart: true });
    if (l) {
      take(l);
      text = text.slice(lead[0].length);
    }
  }
  let first = true;
  text = text.replace(BRACKETED, (whole, body, offset) => {
    const atStart = first && text.slice(0, offset).trim() === '';
    first = false;
    const l = readMarker(body, { atStart });
    if (!l) return whole;
    take(l);
    return ' ';
  });
  text = text.replace(ASR_NOTES, ' ');
  text = text.replace(/\s+([,.!?;:])/g, '$1').replace(/\s{2,}/g, ' ').replace(/^[\s:,\-–—]+/, '').trim();
  return { text, userLang: langs.user, replyLang: langs.reply };
}

const cleanSpeechText = (t) => stripSpeechMeta(t).text;

module.exports = { stripSpeechMeta, cleanSpeechText };
