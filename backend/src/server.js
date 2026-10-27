// Always read backend/.env, whichever folder the server is started from.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const os = require('os');
const express = require('express');
const cors = require('cors');
const { HttpError } = require('./lib/http');
const llm = require('./lib/llm');
const supabase = require('./supabaseClient');

// table -> a column to select (payment_events has no id)
const TABLES = { businesses: 'id', products: 'id', services: 'id', customers: 'id', upcoming_work: 'id', transactions: 'id', subscriptions: 'business_id', payments: 'id', payment_events: 'event_key' };

/** Asks the database for one row from every table. -> { table: 'ok' | 'error message' } */
async function checkDatabase() {
  const out = {};
  await Promise.all(
    Object.entries(TABLES).map(async ([t, col]) => {
      try {
        const { error } = await supabase.from(t).select(col).limit(1);
        out[t] = error ? error.message || error.code || 'error' : 'ok';
      } catch (e) {
        out[t] = e.message || 'unreachable';
      }
    })
  );
  return out;
}

const app = express();
app.disable('x-powered-by');
// Behind a proxy / load balancer, set TRUST_PROXY=1 so rate limits see each visitor's real IP.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

// CORS_ORIGIN="https://a.com,https://b.com" locks the API to those sites.
// Unset = open to everyone (fine for the phone app and local testing).
const origins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors(origins.length ? { origin: origins } : undefined));
// Paystack signs the exact bytes it sends, so the webhook must see the raw body (before the JSON parser).
app.post('/payments/webhook', express.raw({ type: '*/*', limit: '256kb' }), (req, res, next) => require('./routes/payments').webhook(req, res).catch(next));
// Recordings are sent to /ai/transcribe as base64 JSON (about 1.4 MB per minute of speech), so that one
// route accepts larger bodies; everything else keeps the 1 MB limit.
// Sponsored pictures (at most 2 MB, about 2.7 MB as base64) are uploaded to /sponsored/me/media the same way.
const jsonSmall = express.json({ limit: '1mb' });
const jsonAudio = express.json({ limit: '18mb' });
const jsonMedia = express.json({ limit: '4mb' });
app.use((req, res, next) => (req.path === '/ai/transcribe' ? jsonAudio : req.path === '/sponsored/me/media' ? jsonMedia : jsonSmall)(req, res, next));

// API answers are per-user and change when records are saved: never let a browser or proxy reuse one.
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // Basic hardening headers (this server only returns JSON).
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});

// One line per request: method, path, status, time.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path === '/health') return;
    console.log(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// Quick sanity check — visit this in a browser once the server is running.
app.get('/health', async (req, res) => {
  const body = { ok: true, uptime: Math.round(process.uptime()), ai: llm.isConfigured() };
  // /health?deep=1 also proves the database is reachable and every table exists.
  if (req.query.deep) {
    body.db = await checkDatabase();
    body.ok = Object.values(body.db).every((v) => v === 'ok');
    // Which AI models are in use and whether email can be sent (no secrets in here).
    if (llm.isConfigured()) body.models = (await llm.modelReport().catch(() => null))?.models || null;
  }
  res.status(body.ok ? 200 : 503).json(body);
});

app.use('/auth', require('./routes/auth'));
app.use('/business', require('./routes/business'));
app.use('/products', require('./routes/products'));
app.use('/services', require('./routes/services'));
app.use('/customers', require('./routes/customers'));
app.use('/work', require('./routes/work'));
app.use('/transactions', require('./routes/transactions'));
app.use('/ai', require('./routes/ai'));
app.use('/payments', require('./routes/payments'));
app.use('/sponsored', require('./routes/sponsored'));

// The admin portal (ai-cofounder-admin). Admin login required for everything under it.
app.use('/admin-api', require('./admin'));

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// Central error handler: nothing a client sends can crash the server.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON in the request.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

function start() {
  const PORT = Number(process.env.PORT) || 4000;
  const server = app.listen(PORT, () => {
    // Phones can't use "localhost" (that is the phone itself): show the addresses they can use.
    const lan = Object.values(require('os').networkInterfaces())
      .flat()
      .filter((a) => a && a.family === 'IPv4' && !a.internal)
      .map((a) => `http://${a.address}:${PORT}`);
    if (lan.length) {
      console.log(`Phones on the same Wi-Fi reach this server at: ${lan.join(' or ')}`);
      console.log('  (If Expo runs with --tunnel, set EXPO_PUBLIC_API_URL to one of these, or to a tunnel for port ' + PORT + '.)');
    }
    console.log(`AI Co-Founder backend running on http://localhost:${PORT}`);
    for (const list of Object.values(os.networkInterfaces())) {
      for (const n of list || []) {
        if (n.family === 'IPv4' && !n.internal) console.log(`  on your network: http://${n.address}:${PORT}`);
      }
    }
    const sponsored = require('./lib/sponsored');
    sponsored.checkSetup().then((problem) => {
      if (problem) return console.warn(`Sponsored: ${problem}. The Sponsored page will be empty until this is fixed.`);
      console.log('Sponsored: ready.');
      sponsored.startSweeper(); // hourly: ends finished campaigns, closes adverts nobody paid for
    });
    checkDatabase().then((db) => {
      const bad = Object.entries(db).filter(([, v]) => v !== 'ok');
      if (!bad.length) return console.log('Database: connected, all tables found.');
      console.error('Database problem - the app will not be able to save or load data:');
      for (const [t, m] of bad) console.error(`  ${t}: ${m}`);
      console.error('  Check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in backend/.env (the SERVICE ROLE key, not the publishable one),');
      console.error('  and that backend/supabase/schema.sql and then backend/supabase/payments.sql were run in the Supabase SQL editor.');
    });
    const pay = require('./lib/paystack').config();
    console.log(
      pay.enabled
        ? `Payments: Paystack ${pay.mode} mode, ${pay.currency}.`
        : `Payments: OFF (${{ missing_key: 'PAYSTACK_SECRET_KEY is empty', invalid_key: 'PAYSTACK_SECRET_KEY is not an sk_test_/sk_live_ key', live_not_allowed: 'live key needs PAYSTACK_ALLOW_LIVE=true' }[pay.reason] || 'not configured'}). Plans cannot be bought until this is fixed.`
    );
    if (!llm.isConfigured()) console.log('AI: no GROQ_API_KEY set - using built-in rule-based answers; voice-to-text is off.');
    else {
      llm
        .modelReport()
        .then((r) => {
          const m = r.models;
          console.log(`AI: Groq connected. Chat ${m.chat.using} · Live Voice ${m.voice.using} · Speech-to-text ${m.stt.using}`);
          for (const [kind, v] of Object.entries(m)) {
            if (v.configured && v.configuredAvailable === false) console.warn(`  ${kind}: "${v.configured}" is not available on your Groq account - using ${v.using} instead. Update backend/.env (npm run check-ai).`);
          }
        })
        .catch((e) => console.error(`AI: Groq problem - ${e.message}`));
    }
    const secret = process.env.RECOVERY_SECRET || process.env.OTP_SECRET;
    if (!secret || secret.length < 32) console.warn('Security: RECOVERY_SECRET is missing or short - set a long random value in backend/.env.');
    console.log('Accounts: sign-up and password recovery use recovery keys (no email service needed).');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. Close the other server or set PORT in .env.`);
    else console.error(err);
    process.exit(1);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('unhandledRejection', (r) => console.error('Unhandled rejection:', r));
  return server;
}

if (require.main === module) start();

module.exports = app;
