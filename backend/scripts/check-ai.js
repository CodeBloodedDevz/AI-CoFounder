// Run:  npm run check-ai      (from the backend folder)
// Shows which Groq models this API key can use, which ones the server will use for chat, Live Voice and
// speech-to-text (your GROQ_*_MODEL settings, or a working replacement), and tests a real request on each.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const llm = require('../src/lib/llm');
const { TOOLS } = require('../src/lib/assistantTools');

(async () => {
  if (!process.env.GROQ_API_KEY) return console.log('GROQ_API_KEY is empty in backend/.env - add your key from https://console.groq.com/keys');
  let ids;
  try {
    ids = await llm.availableModels({ force: true });
  } catch (e) {
    return console.log(`Groq refused the key: ${e.message}`);
  }
  console.log(ids ? `Models available to this key:\n  ${[...ids].sort().join('\n  ')}\n` : 'Could not list models (network?)\n');
  const report = await llm.modelReport();
  for (const [kind, r] of Object.entries(report.models)) {
    const note = r.configured && r.configuredAvailable === false ? `  (your ${r.configured} is NOT available - using a replacement)` : '';
    console.log(`${kind.padEnd(8)} -> ${r.using}${note}`);
  }
  console.log('\nTesting chat with the assistant\'s tools on the chat and voice models...');
  for (const kind of ['chat', 'voice']) {
    const model = report.models[kind].using;
    const started = Date.now();
    try {
      const msg = await llm.chatWithTools({ model, tools: TOOLS, maxTokens: 60, messages: [{ role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: 'Say hello in one short sentence.' }] });
      console.log(`  ${kind} (${model}): OK in ${Date.now() - started} ms - "${String(msg.content || '(tool call)').slice(0, 60)}"`);
    } catch (e) {
      console.log(`  ${kind} (${model}): FAILED (${e.code}) ${e.message}`);
    }
  }
})();
