const express = require('express');
const multer = require('multer');
const supabase = require('../supabaseClient');
const { requireAuth, requireBusiness } = require('../middleware/auth');
const { validateIdParam } = require('../lib/http');
const engine = require('../lib/aiEngine');
const llm = require('../lib/llm');
const rows = require('../lib/rows');
const {
  INTENT_PROMPTS,
  guessIntent,
  sanitizeHistory,
  whisperPrompt,
  buildSystemPrompt,
} = require('../lib/chatContext');

const router = express.Router();
router.use(requireAuth, requireBusiness);
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
const sttLimit = perUserLimit(10, 60_000); // 10 voice notes / minute / user

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
  res.json({ chat: llm.isConfigured() ? 'ai' : 'rules', transcription: llm.isConfigured() });
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

router.get('/restock-plan', wrap(async (req, res) => {
  const { products, transactions } = await loadBusinessData(req.business.id);
  res.json(engine.restockPlan(products, transactions));
}));

router.get('/pricing/product/:id', wrap(async (req, res) => {
  const { products, transactions } = await loadBusinessData(req.business.id);
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  res.json(engine.recommendPrice(product, transactions, rows.toBusiness(req.business)));
}));

router.get('/pricing/service/:id', wrap(async (req, res) => {
  const { services, upcomingWork } = await loadBusinessData(req.business.id);
  const service = services.find((s) => s.id === req.params.id);
  if (!service) return res.status(404).json({ error: 'Service not found.' });
  res.json(engine.recommendServicePrice(service, upcomingWork, rows.toBusiness(req.business)));
}));

router.get('/busy-hours', wrap(async (req, res) => {
  const { upcomingWork } = await loadBusinessData(req.business.id);
  res.json(engine.recommendBusyHours(upcomingWork));
}));

router.get('/customer-retention', wrap(async (req, res) => {
  const { customers, upcomingWork, services } = await loadBusinessData(req.business.id);
  res.json(engine.recommendCustomerRetention(customers, upcomingWork, services));
}));

router.get('/growth', wrap(async (req, res) => {
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
    });
  }

  const raw = await loadBusinessData(req.business.id);
  const data = { ...raw, business: rows.toBusiness(req.business) };

  const ruleReply = () => {
    const key = intentKey && intentKey !== 'default' ? intentKey : guessIntent(message);
    return engine.chatReply(key, data);
  };

  if (!llm.isConfigured()) return res.json({ reply: ruleReply(), source: 'rules' });

  try {
    const reply = await llm.chatComplete({
      messages: [
        { role: 'system', content: buildSystemPrompt(data) },
        ...sanitizeHistory(req.body.history),
        { role: 'user', content: message },
      ],
    });
    return res.json({ reply, source: 'ai' });
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

function audioFilename(file) {
  const fromName = String(file.originalname || '').split('.').pop().toLowerCase();
  const mime = String(file.mimetype || '').split(';')[0].toLowerCase();
  const ext = AUDIO_EXTENSIONS.has(fromName) ? fromName : EXT_BY_MIME[mime] || 'm4a';
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
  if (!req.file?.buffer?.length) return res.status(400).json({ error: 'No audio was received.' });

  // Whisper has no isiZulu / isiXhosa / Sesotho / Setswana models, so the app
  // only offers English, Afrikaans, or auto-detect.
  const language = ['en', 'af', 'auto'].includes(req.body.language) ? req.body.language : 'en';

  // Vocabulary hint: this business's product and service names.
  let hint = '';
  try {
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
    const { text } = await llm.transcribeAudio({
      buffer: req.file.buffer,
      filename,
      mimeType: mime,
      language,
      prompt: hint,
    });
    res.json({ text });
  } catch (err) {
    console.warn(`[ai/transcribe] failed (${err.code || 'error'}): ${err.message}`);
    if (err.code === 'rate_limited') {
      return res.status(429).json({ error: 'Voice-to-text is busy right now. Your note is saved — try again in a minute.' });
    }
    if (err.code === 'timeout') {
      return res.status(504).json({ error: 'Voice-to-text took too long. Try a shorter note.' });
    }
    return res.status(502).json({ error: "Couldn't turn that recording into text right now." });
  }
}));

module.exports = router;
