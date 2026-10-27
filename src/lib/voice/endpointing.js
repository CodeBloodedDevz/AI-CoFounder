// Deciding whether the person has really finished what they wanted to say.
//
// A pause alone isn't enough: people stop to think mid-sentence ("I want to
// know about... my stock levels"). So after the silence threshold we look at
// the words. A sentence that clearly trails off ("...and", "because", "um",
// a comma) is held for a little longer, and if the person carries on, the
// two parts are joined into one message.

const TRAILING_WORDS = new Set([
  // English
  'and', 'but', 'or', 'so', 'because', 'cause', 'then', 'if', 'when', 'while', 'that', 'which', 'who', 'where', 'what', 'how', 'why',
  'with', 'without', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'from', 'about', 'the', 'a', 'an', 'my', 'your', 'our', 'their', 'his', 'her', 'its',
  'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'will', 'would', 'could', 'should', 'can', 'do', 'does', 'did',
  'like', 'also', 'plus', 'maybe', 'let', 'lets', "let's", 'just', 'really', 'very', 'than', 'as', 'not',
  // Afrikaans
  'en', 'maar', 'of', 'want', 'dat', 'die', "'n", 'n', 'om', 'met', 'vir', 'van', 'oor', 'as', 'toe', 'dan',
  // Portuguese / French / Spanish / German (the common joiners)
  'e', 'mas', 'porque', 'et', 'mais', 'parce', 'que', 'y', 'pero', 'porque', 'und', 'aber', 'weil',
]);

// Words that usually mean the sentence isn't finished when you're dictating a record:
// "add a product Snacks, quantity ..." / "bought price ..." / "called ...".
const DICTATION_TRAILERS = new Set([
  'quantity', 'qty', 'price', 'priced', 'amount', 'cost', 'costing', 'named', 'called', 'bought', 'selling', 'sell', 'sold', 'buy',
  'add', 'record', 'save', 'schedule', 'book', 'per', 'number', 'plus', 'times', 'r', 'around', 'about', 'roughly',
  // Afrikaans
  'hoeveelheid', 'prys', 'koste', 'genaamd', 'verkoop', 'koop', 'bykom',
]);
for (const w of DICTATION_TRAILERS) TRAILING_WORDS.add(w);

const FILLERS = new Set(['um', 'uh', 'umm', 'uhh', 'erm', 'er', 'hmm', 'hm', 'mm', 'ah', 'eh', 'uh-huh']);

const words = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}'\s-]/gu, ' ').split(/\s+/).filter(Boolean);

/**
 * True when it sounds like a finished thought.
 * Conservative on purpose: when unsure, treat it as finished so replies stay quick.
 */
export function isCompleteThought(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/(,|;|:|-|–|—|…|\.\.\.)$/.test(t)) return false; // trailing comma / ellipsis = still going
  const w = words(t);
  if (!w.length) return false;
  const last = w[w.length - 1];
  if (FILLERS.has(last)) return false;
  // Whisper adds a full stop to clean sentence ends; trust a question mark or exclamation straight away.
  if (/[?!]$/.test(t)) return true;
  if (TRAILING_WORDS.has(last)) return false;
  if (w.length === 1 && FILLERS.has(w[0])) return false;
  return true;
}

/** Joins two spoken parts into one message. */
export function mergeTranscripts(a, b) {
  const left = String(a || '').trim().replace(/(\.\.\.|…)+$/u, '').trim();
  const right = String(b || '').trim().replace(/^(\.\.\.|…)+\s*/u, '');
  if (!left) return right;
  if (!right) return left;
  return `${left} ${right}`;
}

/** How long to keep waiting, after the pause threshold, when a sentence sounds unfinished. */
export const holdMsFor = (pauseMs) => Math.round(Math.min(3000, Math.max(1200, pauseMs * 1.5)));

export const PAUSE_PRESETS = [
  { value: 'quick', label: 'Quick', ms: 700 },
  { value: 'balanced', label: 'Balanced', ms: 1100 },
  { value: 'patient', label: 'Patient', ms: 1800 },
];
export const MIN_PAUSE_MS = 500;
export const MAX_PAUSE_MS = 3000;
export const clampPause = (ms) => Math.min(MAX_PAUSE_MS, Math.max(MIN_PAUSE_MS, Math.round(ms / 100) * 100));
