const express = require('express');
const multer = require('multer');
const supabase = require('../supabaseClient');
const { requireAuth, requireBusiness } = require('../middleware/auth');
const { validateIdParam } = require('../lib/http');
const engine = require('../lib/aiEngine');
const llm = require('../lib/llm');
const rows = require('../lib/rows');
const { normalizeLang, RECOGNISED, businessLanguageCode, interfaceLanguage, guessLanguage, guessLanguageDetail } = require('../lib/languages');

// The app sends the language its screens are in. It wins over the saved profile for this request (the person may
// have just switched), but only as the default reply language: what they speak and any translation they ask for
// are handled separately.
function withInterfaceLanguage(business, req) {
  const ui = interfaceLanguage(req.body && req.body.uiLanguage);
  return ui ? { ...business, language: ui } : business;
}
const { interpreterPrompt, conversationAddendum } = require('../lib/voicePrompt');
const { runAgent } = require('../lib/agent');
const { loadSubscription, requireFeature, takeAiMessage } = require('../middleware/plan');
const { cleanText } = require('../lib/http');
const { cleanSpeechText } = require('../lib/speechMeta');
const {
  INTENT_PROMPTS,
  guessIntent,
  sanitizeHistory,
  whisperPrompt,
} = require('../lib/chatContext');

// isiZulu / isiXhosa and Sesotho / Setswana share many words, so a word count can't tell them apart reliably.
const FAMILIES = [['zu', 'xh'], ['st', 'tn']];
const closeRelatives = (a, b) => FAMILIES.some((f) => f.includes(a) && f.includes(b));

const router = express.Router();
router.use(requireAuth, requireBusiness, loadSubscription);
router.param('id', validateIdParam);

// Express 4 doesn't catch rejected promises from async handlers, so every
// route below goes through this wrapper and ends up in server.js's
// catch-all error handler instead of hanging the request.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Tiny per-user limiter so one account can't burn the shared free-tier quota.
function perUserLimit(max, windowMs) {
  const hits = new Map();
  // Forget users who have gone quiet so the map can't grow forever.
  setInterval(() => {
    const now = Date.now();
    for (const [id, times] of hits) if (!times.some((t) => now - t < windowMs)) hits.delete(id);
  }, 5 * 60_000).unref();
  return (req, res, next) => {
    const now = Date.now();
    const recent = (hits.get(req.user.id) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(req.user.id, recent);
      req.rateLimited = true;
    } else {
      recent.push(now);
      hits.set(req.user.id, recent);
    }
    next();
  };
}
const chatLimit = perUserLimit(20, 60_000); // 20 chat messages / minute / user
const sttLimit = perUserLimit(30, 60_000); // 30 voice clips / minute / user (Live Voice sends one per utterance)
const voiceLimit = perUserLimit(40, 60_000); // 40 spoken replies / minute / user

const dataCache = new Map();

// Pulls everything aiEngine's functions need for this business in one go and
// converts it to the camelCase shapes the engine expects (the database
// returns snake_case such as low_stock_threshold / customer_id).
async function loadBusinessData(businessId) {
  const [products, services, customers, upcomingWork, transactions] = await Promise.all([
    supabase.from('products').select('*').eq('business_id', businessId),
    supabase.from('services').select('*').eq('business_id', businessId),
    supabase.from('customers').select('*').eq('business_id', businessId),
    supabase.from('upcoming_work').select('*').eq('business_id', businessId),
    supabase.from('transactions').select('*').eq('business_id', businessId),
  ]);
  const failed = [products, services, customers, upcomingWork, transactions].find((r) => r.error);
  if (failed) throw new Error(failed.error.message);

  return {
    products: (products.data || []).map(rows.toProduct),
    services: (services.data || []).map(rows.toService),
    customers: (customers.data || []).map(rows.toCustomer),
    upcomingWork: (upcomingWork.data || []).map(rows.toWork),
    transactions: (transactions.data || []).map(rows.toTransaction),
  };
}

router.get('/status', (req, res) => {
  res.json({ chat: llm.isConfigured() ? 'ai' : 'rules', transcription: llm.isConfigured(), voice: llm.isConfigured() });
});

router.get('/dashboard-insight', wrap(async (req, res) => {
  const { products, transactions } = await loadBusinessData(req.business.id);
  const summary = engine.summarise(transactions);
  const lowStock = engine.lowStockProducts(products);
  res.json({ insight: engine.dashboardInsight(summary, lowStock) });
}));

router.get('/analytics-insight', wrap(async (req, res) => {
  const { transactions } = await loadBusinessData(req.business.id);
  res.json({ insight: engine.analyticsInsight(transactions) });
}));

router.get('/restock-plan', requireFeature('restockPlan'), wrap(async (req, res) => {
  const { products, transactions } = await loadBusinessData(req.business.id);
  res.json(engine.restockPlan(products, transactions));
}));

router.get('/pricing/product/:id', requireFeature('pricingAssistant'), wrap(async (req, res) => {
  const { products, transactions } = await loadBusinessData(req.business.id);
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  res.json(engine.recommendPrice(product, transactions, rows.toBusiness(req.business)));
}));

router.get('/pricing/service/:id', requireFeature('pricingAssistant'), wrap(async (req, res) => {
  const { services, upcomingWork } = await loadBusinessData(req.business.id);
  const service = services.find((s) => s.id === req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found.' });
  res.json(engine.recommendServicePrice(service, upcomingWork, rows.toBusiness(req.business)));
}));

router.get('/busy-hours', wrap(async (req, res) => {
  const { upcomingWork } = await loadBusinessData(req.business.id);
  res.json(engine.recommendBusyHours(upcomingWork));
}));

router.get('/customer-retention', requireFeature('retentionInsights'), wrap(async (req, res) => {
  const { customers, upcomingWork, services } = await loadBusinessData(req.business.id);
  res.json(engine.recommendCustomerRetention(customers, upcomingWork, services));
}));

router.get('/growth', requireFeature('growthInsights'), wrap(async (req, res) => {
  const { transactions } = await loadBusinessData(req.business.id);
  res.json(engine.recommendBusinessGrowth(transactions));
}));

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

// POST /ai/chat   { message, intentKey?, history?: [{ role, content }] }
//  -> { reply, source: 'ai' | 'rules' | 'limit' }
//
// With a GROQ_API_KEY the reply comes from the LLM, grounded in this
// business's real data. Without a key — or if Groq is down or rate-limited —
// it falls back to the rule-based replies in aiEngine.js, so the chat never
// just stops working.
router.post('/chat', chatLimit, wrap(async (req, res) => {
  const intentKey = typeof req.body.intentKey === 'string' ? req.body.intentKey : '';
  let message = typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 1000) : '';
  if (!message) message = INTENT_PROMPTS[intentKey] || '';
  if (!message) return res.status(400).json({ error: 'message is required.' });

  if (req.rateLimited) {
    return res.json({
      reply: "You're sending messages very quickly — give me a minute and ask again.",
      source: 'limit',
      code: 'rate_limited',
    });
  }

  const quota = takeAiMessage(req);
  if (!quota.allowed) {
    return res.json({
      reply: `You've used your ${quota.limit} free AI messages for today. Upgrade to Pro in More > Subscription for unlimited chat, or try again tomorrow.`,
      source: 'limit',
      code: 'upgrade_required',
      limit: quota.limit,
    });
  }

  const raw = await loadBusinessData(req.business.id);
  const data = { ...raw, business: withInterfaceLanguage(rows.toBusiness(req.business), req) };

  const ruleReply = () => {
    const key = intentKey && intentKey !== 'default' ? intentKey : guessIntent(message);
    return engine.chatReply(key, data);
  };

  if (!llm.isConfigured()) return res.json({ reply: ruleReply(), source: 'rules' });

  try {
    let cancelled = false;
    res.on('close', () => { if (!res.writableFinished) cancelled = true; });
    const out = await runAgent({
      business: req.business,
      data,
      history: sanitizeHistory(req.body.history),
      text: message,
      voice: false,
      isCancelled: () => cancelled,
    });
    dataCache.delete(req.business.id);
    const body = { reply: out.reply, source: 'ai' };
    if (out.actions.length) {
      body.actions = out.actions;
      body.changed = out.changed;
    }
    return res.json(body);
  } catch (err) {
    console.warn(`[ai/chat] LLM unavailable (${err.code || 'error'}): ${err.message} — using rule-based reply.`);
    return res.json({ reply: ruleReply(), source: 'rules' });
  }
}));

/* ------------------------------------------------------------------ */
/* Voice -> text                                                       */
/* ------------------------------------------------------------------ */

const MAX_AUDIO_BYTES = 12 * 1024 * 1024; // Groq's free tier allows 25 MB; a 2-minute note is ~1 MB.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AUDIO_BYTES, files: 1 } });

function receiveAudio(req, res, next) {
  upload.single('audio')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'That recording is too large. Keep voice notes under 2 minutes.' });
    }
    return res.status(400).json({ error: 'Could not read the uploaded audio.' });
  });
}

const AUDIO_EXTENSIONS = new Set(['m4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'wav', 'webm', 'ogg', 'flac']);
// Containers Whisper doesn't list but phones may write (AAC in MP4 / 3GP): sent as .m4a / .mp4.
const EXT_ALIASES = { aac: 'm4a', '3gp': 'mp4', '3gpp': 'mp4', caf: 'm4a' };
const EXT_BY_MIME = {
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/aac': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
};

/** { audio: base64, filename?, mimeType? } -> { file: { buffer, originalname, mimetype } } | { status, error } */
function audioFromJson(body) {
  const b64 = String(body.audio || '').replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  if (!b64) return { status: 400, error: 'No audio was received.' };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { status: 400, error: 'Could not read the uploaded audio.' };
  if (Math.floor((b64.length * 3) / 4) > MAX_AUDIO_BYTES) {
    return { status: 413, error: 'That recording is too large. Keep voice notes under 2 minutes.' };
  }
  const buffer = Buffer.from(b64, 'base64');
  if (!buffer.length) return { status: 400, error: 'No audio was received.' };
  return {
    file: {
      buffer,
      originalname: typeof body.filename === 'string' ? body.filename.slice(0, 80) : 'voice-note.m4a',
      mimetype: typeof body.mimeType === 'string' ? body.mimeType.slice(0, 60) : '',
    },
  };
}

/** A server set-up problem (key / model) as a clear message for the app, instead of a generic failure. */
function aiSetupError(err) {
  if (err.code === 'not_configured') return { error: "Voice and AI aren't set up on the server (GROQ_API_KEY is empty in backend/.env).", code: err.code };
  if (err.code === 'bad_key') return { error: 'The server\'s Groq API key was rejected. Put a valid key in backend/.env (GROQ_API_KEY) and restart it.', code: err.code };
  if (err.code === 'model_unavailable') return { error: 'The AI model set on the server is not available. Run "npm run check-ai" in the backend folder to see which models to use.', code: err.code };
  return null;
}

function audioFilename(file) {
  const fromName = String(file.originalname || '').split('.').pop().toLowerCase();
  const mime = String(file.mimetype || '').split(';')[0].toLowerCase();
  const ext = AUDIO_EXTENSIONS.has(fromName) ? fromName : EXT_ALIASES[fromName] || EXT_BY_MIME[mime] || 'm4a';
  return { filename: `voice-note.${ext}`, mime: mime || `audio/${ext}` };
}

// POST /ai/transcribe  (multipart/form-data: audio = file, language = en | af | auto)
//  -> { text }
router.post('/transcribe', sttLimit, receiveAudio, wrap(async (req, res) => {
  if (req.rateLimited) {
    return res.status(429).json({ error: 'Too many voice notes at once — wait a minute and try again.' });
  }
  if (!llm.isConfigured()) {
    return res.status(503).json({ error: "Voice-to-text isn't set up on the server yet (missing GROQ_API_KEY)." });
  }
  // The app sends the recording as base64 JSON ({ audio, filename, mimeType, language }); multipart uploads
  // (field "audio") are still accepted for other clients.
  if (!req.file && req.body && typeof req.body.audio === 'string') {
    const decoded = audioFromJson(req.body);
    if (decoded.error) return res.status(decoded.status).json({ error: decoded.error });
    req.file = decoded.file;
  }
  if (!req.file?.buffer?.length) return res.status(400).json({ error: 'No audio was received.' });

  // Whisper has no isiZulu / isiXhosa / Sesotho / Setswana models, so the app
  // only offers English, Afrikaans, or auto-detect.
  const language = [...RECOGNISED, 'auto'].includes(req.body.language) ? req.body.language : 'en';

  // Vocabulary hint: this business's product and service names. The hint is
  // English text, so it is skipped when the language is auto-detected.
  let hint = '';
  try {
    if (language === 'auto') throw new Error('no hint');
    const [p, s] = await Promise.all([
      supabase.from('products').select('name').eq('business_id', req.business.id).limit(40),
      supabase.from('services').select('name').eq('business_id', req.business.id).limit(40),
    ]);
    hint = whisperPrompt({
      business: req.business,
      productNames: (p.data || []).map((r) => r.name),
      serviceNames: (s.data || []).map((r) => r.name),
    });
  } catch {
    /* the hint is optional */
  }

  const { filename, mime } = audioFilename(req.file);
  try {
    const { text, language: detected } = await llm.transcribeAudio({
      buffer: req.file.buffer,
      filename,
      mimeType: mime,
      language,
      prompt: hint,
      fallbackLanguage: businessLanguageCode(req.business.language) || 'en',
    });
    // Only the words that were said: no recogniser notes such as [BLANK_AUDIO] or language markers.
    const clean = cleanSpeechText(text);
    res.json(detected ? { text: clean, language: detected } : { text: clean });
  } catch (err) {
    console.warn(`[ai/transcribe] failed (${err.code || 'error'}): ${err.message}`);
    const setup = aiSetupError(err);
    if (setup) return res.status(503).json(setup);
    if (err.code === 'rate_limited') {
      return res.status(429).json({ error: 'Voice-to-text is busy right now. Your note is saved — try again in a minute.' });
    }
    if (err.code === 'timeout') {
      return res.status(504).json({ error: 'Voice-to-text took too long. Try a shorter note.' });
    }
    return res.status(502).json({ error: "Couldn't turn that recording into text right now." });
  }
}));

/* ------------------------------------------------------------------ */
/* Live Voice reply                                                    */
/* ------------------------------------------------------------------ */

// Optional short-lived cache (VOICE_DATA_CACHE_MS) for very chatty setups.
async function cachedBusinessData(business) {
  const ttl = Number(process.env.VOICE_DATA_CACHE_MS ?? 0); // 0 = always fresh, so the assistant sees records it just changed
  const hit = dataCache.get(business.id);
  if (ttl > 0 && hit && Date.now() - hit.at < ttl) return { ...hit.data, business: rows.toBusiness(business) };
  const raw = await loadBusinessData(business.id);
  if (ttl > 0) {
    dataCache.set(business.id, { at: Date.now(), data: raw });
    if (dataCache.size > 200) dataCache.delete(dataCache.keys().next().value);
  }
  return { ...raw, business: rows.toBusiness(business) };
}

// POST /ai/voice/reply { text, from?, mode: 'conversation'|'interpreter', targetLang?, homeLang?, history? }
//  -> { reply, to, from, source }
router.post('/voice/reply', voiceLimit, wrap(async (req, res) => {
  const text = typeof req.body.text === 'string' ? req.body.text.trim().slice(0, 1000) : '';
  if (!text) return res.status(400).json({ error: 'text is required.' });
  if (req.rateLimited) {
    return res.status(429).json({ error: 'Too many voice turns at once — pause for a moment.' });
  }
  if (!llm.isConfigured()) {
    return res.status(503).json({ error: "Live Voice isn't set up on the server yet (missing GROQ_API_KEY)." });
  }

  const quota = takeAiMessage(req);
  if (!quota.allowed) {
    return res.status(402).json({
      error: `You've used your ${quota.limit} free AI messages for today. Upgrade to Pro for unlimited Live Voice and chat.`,
      code: 'upgrade_required',
    });
  }

  const mode = req.body.mode === 'interpreter' ? 'interpreter' : 'conversation';
  const from = normalizeLang(req.body.from);
  const target = normalizeLang(req.body.targetLang);
  const home = normalizeLang(req.body.homeLang) || 'en';

  try {
    if (mode === 'interpreter') {
      // Two-way: if they already speak the target language, translate back to their home language.
      const to = !target ? home : from && from === target ? home : target;
      const reply = await llm.withModel('voice', null, (model) => llm.chatComplete({
        model,
        temperature: 0.2,
        maxTokens: 400,
        timeoutMs: 15_000,
        messages: [
          { role: 'system', content: interpreterPrompt(to, from) },
          { role: 'user', content: text },
        ],
      }));
      return res.json({ reply: cleanSpeechText(reply), to, from: from || null, source: 'ai' });
    }

    const cached = await cachedBusinessData(req.business);
    const data = { ...cached, business: withInterfaceLanguage(cached.business, req) };
    const sticky = normalizeLang(req.body.sticky);
    let cancelled = false;
    res.on('close', () => { if (!res.writableFinished) cancelled = true; });
    const out = await runAgent({
      business: req.business,
      data,
      history: sanitizeHistory(req.body.history),
      text,
      voice: true,
      pinned: target,
      sticky,
      from,
      turnId: cleanText(req.body.turnId, 64),
      supersedes: cleanText(req.body.supersedes, 64),
      isCancelled: () => cancelled,
      extraSystem: conversationAddendum(null, null, { withLanguage: false }),
    });
    if (out.changed.length) dataCache.delete(req.business.id);
    if (out.cancelled) return res.status(499).end();
    // Which language was spoken, and which one the answer is in (this picks the voice that reads it out).
    // The words beat a guess from a short audio clip: the AI's own tag first, then a look at the words,
    // then the recogniser's guess.
    const heard = out.userLang || guessLanguage(text) || from || null;
    let to = target || out.replyLang || out.sticky || heard || businessLanguageCode(interfaceLanguage(req.body.uiLanguage) || req.business.language) || 'en';
    // Never read an answer out with a voice for the wrong language: trust the words actually written.
    const written = guessLanguageDetail(out.reply);
    if (written && written.confident && written.code !== to && !closeRelatives(written.code, to)) to = written.code;
    const body = { reply: out.reply, to, from: heard, source: 'ai' };
    if (out.sticky !== sticky) body.sticky = out.sticky || 'auto';
    if (out.actions.length) {
      body.actions = out.actions;
      body.changed = out.changed;
    }
    return res.json(body);
  } catch (err) {
    console.warn(`[ai/voice] failed (${err.code || 'error'}): ${err.message}`);
    const setup = aiSetupError(err);
    if (setup) return res.status(503).json(setup);
    if (err.code === 'rate_limited') return res.status(429).json({ error: 'The assistant is busy right now. Try again in a moment.' });
    if (err.code === 'timeout') return res.status(504).json({ error: 'The assistant took too long to answer.' });
    if (mode === 'conversation') {
      // A question can still be answered from the rules. A request to DO something can't, and
      // pretending otherwise would be a lie, so say honestly that it didn't happen.
      const wantsAction = /\b(add|record|sold|sell|bought|buy|schedule|book|delete|remove|update|change|set|save|create|cancel)\b/i.test(text);
      const intent = guessIntent(text);
      if (!wantsAction && intent !== 'default') {
        const data = await cachedBusinessData(req.business);
        return res.json({ reply: engine.chatReply(intent, data), to: 'en', from: from || null, source: 'rules' });
      }
      return res.json({
        reply: "I'm having trouble reaching my AI service right now, so I didn't do that. Nothing was changed. Please try again in a moment.",
        to: 'en',
        from: from || null,
        source: 'unavailable',
        detail: `${err.code || 'error'}${err.status ? ` ${err.status}` : ''}`,
      });
    }
    return res.status(502).json({ error: "Couldn't translate that right now." });
  }
}));

module.exports = router;
module.exports.audioFromJson = audioFromJson;
module.exports.audioFilename = audioFilename;
