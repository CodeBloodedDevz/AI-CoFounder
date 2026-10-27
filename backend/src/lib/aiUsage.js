// Records one line per AI request (chat or speech-to-text) so the admin portal can show real AI usage:
// requests, tokens, response time and error rate. Only numbers are stored, never what anyone said.
//
// Writes go to public.ai_usage_events (created by backend/supabase/admin.sql). Recording never slows
// down or breaks an AI request: it runs in the background and every failure is ignored. If the table
// doesn't exist yet, recording switches itself off (one warning) until the server restarts.

// The database client is loaded on first use, so scripts that only talk to the AI (npm run check-ai)
// don't need database settings.
let supabase = null;
let disabled = false;

const kindOf = (path) => (/audio\/transcriptions/.test(String(path)) ? 'speech' : 'chat');

/** Called by lib/llm.js after every Groq request. Never throws, never waits. */
function record({ path, ok, ms, tokens = null, code = null }) {
  if (disabled) return;
  const row = {
    kind: kindOf(path),
    ok: Boolean(ok),
    duration_ms: Math.max(0, Math.round(Number(ms) || 0)),
    total_tokens: Number.isFinite(Number(tokens)) && tokens !== null ? Math.round(Number(tokens)) : null,
    error_code: ok ? null : String(code || 'error').slice(0, 40),
  };
  Promise.resolve()
    .then(() => {
      supabase = supabase || require('../supabaseClient');
      return supabase.from('ai_usage_events').insert(row);
    })
    .then((res) => {
      const err = res && res.error;
      if (!err) return;
      if (err.code === 'PGRST205' || err.code === '42P01' || /does not exist|could not find the table/i.test(err.message || '')) {
        disabled = true;
        console.warn('[ai-usage] table ai_usage_events not found - run backend/supabase/admin.sql to see AI usage in the admin portal.');
      }
    })
    .catch(() => {});
}

const _reset = () => {
  disabled = false;
};

module.exports = { record, kindOf, _reset };
