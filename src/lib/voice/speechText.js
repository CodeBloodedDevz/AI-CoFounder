// Preparing text for the speaker: remove things that sound wrong when read
// aloud, and cut long answers into sentences so the voice can start quickly,
// pause naturally between sentences and be interrupted cleanly.

const ABBREVIATIONS = /\b(mr|mrs|ms|dr|prof|sr|jr|vs|etc|e\.g|i\.e|no|st)\.$/i;

/** Plain, speakable text: no markdown, links or emoji; "R150" becomes "150 rand". */
export function speechText(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>~]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\p{Extended_Pictographic}|️/gu, '')
    .replace(/\bR\s?(\d[\d ]*(?:[.,]\d{1,2})?)/g, (_, n) => `${n.replace(/ /g, '')} rand`)
    .replace(/(\d)\s?%/g, '$1 percent')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Sentences for sequential speaking. Very short ones are joined to the next so speech doesn't sound choppy. */
export function splitSentences(text, { minLength = 24, maxLength = 220 } = {}) {
  const clean = speechText(text);
  if (!clean) return [];

  const raw = [];
  let current = '';
  for (let i = 0; i < clean.length; i++) {
    current += clean[i];
    const ch = clean[i];
    const next = clean[i + 1];
    const endsSentence = /[.!?…]/.test(ch) && (next === undefined || /\s/.test(next)) && !ABBREVIATIONS.test(current.trim());
    if (endsSentence) {
      raw.push(current.trim());
      current = '';
    }
  }
  if (current.trim()) raw.push(current.trim());

  // Split anything very long at commas / semicolons.
  const pieces = raw.flatMap((s) => {
    if (s.length <= maxLength) return [s];
    const parts = s.split(/(?<=[,;:])\s+/);
    const out = [];
    let buf = '';
    for (const p of parts) {
      if ((buf + ' ' + p).trim().length > maxLength && buf) {
        out.push(buf.trim());
        buf = p;
      } else buf = `${buf} ${p}`;
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  });

  // Join very short ones to the next.
  const joined = [];
  for (const piece of pieces) {
    const last = joined[joined.length - 1];
    if (last !== undefined && last.length < minLength) joined[joined.length - 1] = `${last} ${piece}`;
    else joined.push(piece);
  }
  return joined;
}

/** A rough "how long will this take to say" used as a safety timeout (ms). */
export const estimateSpeechMs = (text, rate = 1) => Math.round(1500 + (String(text).length * 75) / Math.max(0.5, rate));
