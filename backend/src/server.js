require('dotenv').config();
const os = require('os');
const express = require('express');
const cors = require('cors');
const { HttpError } = require('./lib/http');
const llm = require('./lib/llm');

const app = express();
app.disable('x-powered-by');

// CORS_ORIGIN="https://a.com,https://b.com" locks the API to those sites.
// Unset = open to everyone (fine for the phone app and local testing).
const origins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors(origins.length ? { origin: origins } : undefined));
app.use(express.json({ limit: '1mb' }));

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
app.get('/health', (req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()), ai: llm.isConfigured() }));

app.use('/business', require('./routes/business'));
app.use('/products', require('./routes/products'));
app.use('/services', require('./routes/services'));
app.use('/customers', require('./routes/customers'));
app.use('/work', require('./routes/work'));
app.use('/transactions', require('./routes/transactions'));
app.use('/ai', require('./routes/ai'));

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
    console.log(`AI Co-Founder backend running on http://localhost:${PORT}`);
    for (const list of Object.values(os.networkInterfaces())) {
      for (const n of list || []) {
        if (n.family === 'IPv4' && !n.internal) console.log(`  on your network: http://${n.address}:${PORT}`);
      }
    }
    console.log(llm.isConfigured() ? 'AI: Groq connected.' : 'AI: no GROQ_API_KEY set - using built-in rule-based answers.');
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
