// Thin client for Groq's free tier (OpenAI-compatible REST API).
// One free API key covers BOTH things this app needs:
//   - chat answers   -> /chat/completions     (default: llama-3.3-70b-versatile)
//   - speech-to-text -> /audio/transcriptions (default: whisper-large-v3-turbo)
//
// The key lives only in the backend's .env (GROQ_API_KEY) — it is never
// shipped inside the mobile app. Uses Node 18+'s built-in fetch/FormData/Blob,
// so there are no extra dependencies.

const { normalizeLang, RECOGNISED } = require('./languages');
const aiUsage = require('./aiUsage');

const GROQ_BASE = 'https://api.groq.com/openai/v1';

class LlmError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
    // not_configured | bad_key | rate_limited | timeout | network | upstream_error | empty
    this.code = code;
  }
}

function settings() {
  return {
    apiKey: process.env.GROQ_API_KEY,
    chatModel: process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile',
    sttModel: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
    // Live Voice wants quick replies, so it uses a fast non-reasoning model unless you choose another.
    voiceModel: process.env.GROQ_VOICE_MODEL || 'llama-3.3-70b-versatile',
    // Language auto-detection is where the "turbo" Whisper is weakest, so 'auto' uses the full model.
    sttModelAuto: process.env.GROQ_STT_MODEL_AUTO || 'whisper-large-v3',
  };
}

const chatModel = () => settings().chatModel;

// ---- Which models this Groq account can actually use ----
// Groq retires models over time (the small llama 3.1 "instant" model is gone for many accounts). Instead of trusting a
// hard-coded name, the server asks Groq which models exist (GET /models, cached for 10 minutes) and uses
// the configured model when it is available, otherwise the first available one from a short list of
// suitable models. A model that answers "does not exist" is skipped from then on.
const PREFERRED = {
  // Chat with tools (the assistant can record sales, bookings...): strong instruction / tool-call models.
  chat: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'moonshotai/kimi-k2-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct', 'qwen/qwen3-32b'],
  // Live Voice: fast replies first.
  voice: ['llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'meta-llama/llama-4-scout-17b-16e-instruct', 'openai/gpt-oss-120b', 'qwen/qwen3-32b'],
  stt: ['whisper-large-v3-turbo', 'whisper-large-v3'],
  sttAuto: ['whisper-large-v3', 'whisper-large-v3-turbo'],
};
const CONFIGURED = {
  chat: () => process.env.GROQ_CHAT_MODEL,
  voice: () => process.env.GROQ_VOICE_MODEL,
  stt: () => process.env.GROQ_STT_MODEL,
  sttAuto: () => process.env.GROQ_STT_MODEL_AUTO,
};
const unavailable = new Set();
let modelCache = { at: 0, ids: null };

function markUnavailable(model) {
  if (model && !unavailable.has(model)) {
    unavailable.add(model);
    console.warn(`[ai] model "${model}" is not available on this Groq account: skipping it. Run "npm run check-ai" to see the models you can use.`);
  }
}

/** Ids of the models this key can use, or null when Groq can't be asked (then nothing is filtered). */
async function availableModels({ force = false } = {}) {
  if (!force && modelCache.ids && Date.now() - modelCache.at < 10 * 60_000) return modelCache.ids;
  try {
    const data = await groqJsonOnce('/models', { method: 'GET' }, 8_000);
    const ids = new Set((data?.data || []).filter((m) => m.active !== false).map((m) => m.id));
    modelCache = { at: Date.now(), ids };
    return ids;
  } catch (e) {
    if (e.code === 'bad_key' || e.code === 'not_configured') throw e;
    return modelCache.ids; // keep the last good list (or null)
  }
}

/** Models to try for a kind of work, best first: the configured one (if usable), then suitable fallbacks. */
async function modelCandidates(kind, explicit) {
  const ids = await availableModels().catch(() => null);
  const usable = (m) => m && !unavailable.has(m) && (!ids || ids.has(m));
  const list = [explicit, CONFIGURED[kind]?.(), ...(PREFERRED[kind] || [])].filter((m, i, arr) => m && arr.indexOf(m) === i);
  const ok = list.filter(usable);
  if (ok.length) return ok.slice(0, 3);
  // Nothing on our list is offered: use any active chat-capable model rather than failing outright.
  if (ids && (kind === 'chat' || kind === 'voice')) {
    const any = [...ids].find((m) => !/whisper|guard|tts|playai|orpheus|distil/i.test(m) && !unavailable.has(m));
    if (any) return [any];
  }
  return list.slice(0, 1);
}

async function modelFor(kind, explicit) {
  return (await modelCandidates(kind, explicit))[0];
}

/** What the server will use (for /health and npm run check-ai). */
async function modelReport() {
  const ids = await availableModels({ force: true }).catch(() => null);
  const out = {};
  for (const kind of ['chat', 'voice', 'stt', 'sttAuto']) {
    const configured = CONFIGURED[kind]() || null;
    out[kind] = {
      configured,
      using: await modelFor(kind),
      configuredAvailable: configured ? (ids ? ids.has(configured) : null) : null,
    };
  }
  return { modelsListed: Boolean(ids), models: out };
}

/** Calls fn(model) with the best model for `kind`, moving to the next one if a model is unavailable. */
async function withModel(kind, explicit, fn) {
  const candidates = await modelCandidates(kind, explicit);
  let lastErr;
  for (const m of candidates) {
    try {
      return await fn(m);
    } catch (e) {
      if (e.code !== 'model_unavailable') throw e;
      markUnavailable(m);
      lastErr = e;
    }
  }
  throw new LlmError(
    `None of the AI models for ${kind} are available on this Groq account (${candidates.join(', ')}). Set GROQ_${kind === 'voice' ? 'VOICE' : kind === 'chat' ? 'CHAT' : 'STT'}_MODEL in backend/.env to a model listed by "npm run check-ai".`,
    { status: lastErr?.status, code: 'model_unavailable' }
  );
}

function isConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

// Sends the request and returns the parsed JSON body. The timeout covers the
// whole exchange (headers + body), not just the first byte.
async function groqJson(path, init, timeoutMs) {
  // Every AI request is counted once (with its retry) for the admin portal's AI usage figures.
  const started = Date.now();
  try {
    const data = await groqJsonRetrying(path, init, timeoutMs);
    aiUsage.record({ path, ok: true, ms: Date.now() - started, tokens: data?.usage?.total_tokens ?? null });
    return data;
  } catch (err) {
    aiUsage.record({ path, ok: false, ms: Date.now() - started, code: err?.code });
    throw err;
  }
}

async function groqJsonRetrying(path, init, timeoutMs) {
  // One quick retry for a flaky network or a Groq 5xx. Never for 429 (that
  // would just burn more of the free quota) or bad keys.
  try {
    return await groqJsonOnce(path, init, timeoutMs);
  } catch (err) {
    const retryable = err instanceof LlmError && (err.code === 'network' || (err.code === 'upstream_error' && err.status >= 500));
    if (!retryable) throw err;
    await new Promise((r) => setTimeout(r, 600));
    return groqJsonOnce(path, init, timeoutMs);
  }
}

async function groqJsonOnce(path, init, timeoutMs) {
  const { apiKey } = settings();
  if (!apiKey) throw new LlmError('AI is not configured on the server.', { code: 'not_configured' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${GROQ_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers || {}) },
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json())?.error?.message || '';
      } catch {
        /* non-JSON error body */
      }
      let code = res.status === 429 ? 'rate_limited' : res.status === 401 ? 'bad_key' : 'upstream_error';
      // A model that was removed or isn't enabled for this account (a retired model id).
      if ((res.status === 404 || res.status === 400) && /model.*(does not exist|not found|decommissioned|no longer supported|do not have access)/i.test(detail)) {
        code = 'model_unavailable';
        const used = (() => {
          try {
            return JSON.parse(init.body).model;
          } catch {
            return null;
          }
        })();
        if (used) markUnavailable(used);
      }
      throw new LlmError(detail || `Groq request failed (${res.status}).`, { status: res.status, code });
    }
    return await res.json();
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (err.name === 'AbortError') throw new LlmError('The AI service took too long to respond.', { code: 'timeout' });
    throw new LlmError(`Could not reach the AI service: ${err.message}`, { code: 'network' });
  } finally {
    clearTimeout(timer);
  }
}

// "Thinking" models such as openai/gpt-oss-120b spend part of the token budget
// on hidden reasoning, so a small limit can leave the visible answer empty.
// For those we ask for low reasoning effort and allow a bigger budget.
function chatBody({ chatModel, messages, temperature, maxTokens }) {
  const body = { model: chatModel, messages, temperature, max_tokens: maxTokens };
  if (/gpt-oss/i.test(chatModel)) {
    body.reasoning_effort = 'low';
    body.max_tokens = Math.max(maxTokens, 1500);
  }
  return body;
}

/** messages: [{ role: 'system'|'user'|'assistant', content: string }] */
async function chatComplete({ messages, temperature = 0.4, maxTokens = 450, model, timeoutMs = 25_000 }) {
  const { chatModel: defaultModel } = settings();
  const chatModel = model || defaultModel;
  const data = await groqJson(
    '/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatBody({ chatModel, messages, temperature, maxTokens })),
    },
    timeoutMs
  );
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new LlmError('The AI returned an empty answer.', { code: 'empty' });
  return text;
}

/**
 * One chat turn that may ask for tools. Returns the assistant message
 * { content, tool_calls? } instead of just text, so the caller can run the
 * tools and continue the conversation.
 */
async function chatWithTools({ messages, tools, toolChoice = 'auto', temperature = 0.3, maxTokens = 500, model, timeoutMs = 25_000 }) {
  const { chatModel: defaultModel } = settings();
  const chatModel = model || defaultModel;
  const body = chatBody({ chatModel, messages, temperature, maxTokens });
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = toolChoice;
    if (toolChoice !== 'none') body.parallel_tool_calls = false;
  }
  const data = await groqJson(
    '/chat/completions',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    timeoutMs
  );
  const message = data?.choices?.[0]?.message;
  if (!message) throw new LlmError('The AI returned an empty answer.', { code: 'empty' });
  return { content: (message.content || '').trim(), tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : [] };
}

/**
 * Speech-to-text with Whisper. `language` is an ISO-639-1 code ('en', 'af') or
 * 'auto'. `prompt` is an optional vocabulary hint (product names etc.).
 * Returns { text } — empty string when the recording contains no speech.
 */
async function transcribeAudio({ buffer, filename, mimeType, language = 'en', prompt, fallbackLanguage = 'en' }) {
  const first = await transcribeOnce({ buffer, filename, mimeType, language, prompt });
  if (language !== 'auto') return first;

  // Automatic language detection on a short clip often guesses a language we cannot work with
  // (Welsh, Nynorsk, Malay...) for what is really accented English. When that happens, read the clip
  // again in the language this business normally uses instead of returning nonsense.
  const detected = normalizeLang(first.rawLanguage);
  const usable = detected && RECOGNISED.includes(detected);
  if (usable || (!first.text && !first.rawLanguage)) return stripRaw(first);
  const retryLang = RECOGNISED.includes(fallbackLanguage) ? fallbackLanguage : 'en';
  try {
    const second = await transcribeOnce({ buffer, filename, mimeType, language: retryLang, prompt });
    if (second.text) return { text: second.text, language: retryLang };
  } catch {
    /* keep the first attempt */
  }
  return stripRaw(first);
}

function stripRaw(r) {
  const out = { text: r.text };
  if (r.language) out.language = r.language;
  return out;
}

async function transcribeOnce(args) {
  return withModel(args.language === 'auto' ? 'sttAuto' : 'stt', null, (model) => transcribeWith(model, args));
}

async function transcribeWith(model, { buffer, filename, mimeType, language, prompt }) {

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), filename);
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  if (language && language !== 'auto') form.append('language', language);
  if (prompt) form.append('prompt', prompt.slice(0, 500)); // Whisper allows ~224 tokens

  const data = await groqJson('/audio/transcriptions', { method: 'POST', body: form }, 60_000);

  // Whisper tends to "hear" phrases like "Thank you." in silence or noise.
  // Drop segments that look like non-speech, and runaway repetition.
  const segments = Array.isArray(data?.segments) ? data.segments : [];
  const isNoise = (seg) => (seg.no_speech_prob > 0.6 && seg.avg_logprob < -1) || seg.compression_ratio > 2.6;
  const kept = segments.filter((seg) => !isNoise(seg));
  let text;
  if (segments.length && !kept.length) text = '';
  else if (kept.length < segments.length && kept.every((seg) => typeof seg.text === 'string')) text = kept.map((seg) => seg.text).join('').trim();
  else text = String(data?.text || '').trim();

  const result = { text, rawLanguage: data?.language || null };
  const detected = normalizeLang(data?.language); // "English" / "en" -> "en"
  if (detected && text) result.language = detected;
  return result;
}

module.exports = { chatModel, isConfigured, chatComplete, chatWithTools, transcribeAudio, LlmError, modelCandidates, modelFor, modelReport, withModel, availableModels };
