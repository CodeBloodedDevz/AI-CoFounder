// Thin client for Groq's free tier (OpenAI-compatible REST API).
// One free API key covers BOTH things this app needs:
//   - chat answers   -> /chat/completions     (default: llama-3.3-70b-versatile)
//   - speech-to-text -> /audio/transcriptions (default: whisper-large-v3-turbo)
//
// The key lives only in the backend's .env (GROQ_API_KEY) — it is never
// shipped inside the mobile app. Uses Node 18+'s built-in fetch/FormData/Blob,
// so there are no extra dependencies.

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
  };
}

function isConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

// Sends the request and returns the parsed JSON body. The timeout covers the
// whole exchange (headers + body), not just the first byte.
async function groqJson(path, init, timeoutMs) {
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
      const code = res.status === 429 ? 'rate_limited' : res.status === 401 ? 'bad_key' : 'upstream_error';
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

/** messages: [{ role: 'system'|'user'|'assistant', content: string }] */
async function chatComplete({ messages, temperature = 0.4, maxTokens = 450 }) {
  const { chatModel } = settings();
  const data = await groqJson(
    '/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: chatModel, messages, temperature, max_tokens: maxTokens }),
    },
    25_000
  );
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new LlmError('The AI returned an empty answer.', { code: 'empty' });
  return text;
}

/**
 * Speech-to-text with Whisper. `language` is an ISO-639-1 code ('en', 'af') or
 * 'auto'. `prompt` is an optional vocabulary hint (product names etc.).
 * Returns { text } — empty string when the recording contains no speech.
 */
async function transcribeAudio({ buffer, filename, mimeType, language = 'en', prompt }) {
  const { sttModel } = settings();

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), filename);
  form.append('model', sttModel);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  if (language && language !== 'auto') form.append('language', language);
  if (prompt) form.append('prompt', prompt.slice(0, 500)); // Whisper allows ~224 tokens

  const data = await groqJson('/audio/transcriptions', { method: 'POST', body: form }, 60_000);

  // Whisper tends to "hear" phrases like "Thank you." in silence. If every
  // segment looks like non-speech, treat the note as empty instead.
  const segments = Array.isArray(data?.segments) ? data.segments : [];
  const looksSilent =
    segments.length > 0 && segments.every((s) => s.no_speech_prob > 0.6 && s.avg_logprob < -1);
  if (looksSilent) return { text: '' };

  return { text: String(data?.text || '').trim() };
}

module.exports = { isConfigured, chatComplete, transcribeAudio, LlmError };
