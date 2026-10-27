// Languages for Live Voice (names are used inside AI prompts).
const NAMES = {
  en: 'English', af: 'Afrikaans', zu: 'isiZulu', xh: 'isiXhosa', st: 'Sesotho', tn: 'Setswana',
  sw: 'Kiswahili', sn: 'Shona', pt: 'Portuguese', fr: 'French', es: 'Spanish', de: 'German',
  it: 'Italian', nl: 'Dutch', ar: 'Arabic', hi: 'Hindi', zh: 'Chinese', ja: 'Japanese', ru: 'Russian',
};

// Whisper reports the language it heard as a lowercase English name.
const WHISPER_NAMES = {
  english: 'en', afrikaans: 'af', zulu: 'zu', xhosa: 'xh', sesotho: 'st', sotho: 'st', tswana: 'tn', setswana: 'tn',
  swahili: 'sw', shona: 'sn', portuguese: 'pt', french: 'fr', spanish: 'es', german: 'de',
  italian: 'it', dutch: 'nl', arabic: 'ar', hindi: 'hi', chinese: 'zh', japanese: 'ja', russian: 'ru',
};

// The app's preferred (interface) language is one of exactly three. This is the business setting
// shown as "Preferred language"; it is separate from the language a person SPEAKS to the assistant,
// which can be any language in NAMES above.
const APP_LANGUAGES = ['English', 'Afrikaans', 'isiZulu'];
const APP_LANGUAGE_CODES = { English: 'en', Afrikaans: 'af', isiZulu: 'zu' };
// Names, codes and locales people (or older app versions) may send -> the stored name.
const APP_LANGUAGE_NAMES = {
  english: 'English', en: 'English', 'en-za': 'English', 'en-us': 'English', 'en-gb': 'English',
  afrikaans: 'Afrikaans', af: 'Afrikaans', 'af-za': 'Afrikaans',
  isizulu: 'isiZulu', zulu: 'isiZulu', 'isizulu (zulu)': 'isiZulu', zu: 'isiZulu', 'zu-za': 'isiZulu',
};

/** "Zulu" | "zu" | "isiZulu (Zulu)" | "af-ZA" -> "isiZulu" | "Afrikaans" | "English"; null for anything else. */
function preferredLanguage(value) {
  if (typeof value !== 'string') return null;
  return APP_LANGUAGE_NAMES[value.trim().toLowerCase()] || null;
}

// Languages Whisper can recognise from speech (the ones we offer as spoken input).
const RECOGNISED = ['en', 'af', 'sw', 'sn', 'pt', 'fr', 'es', 'de'];

/** "English" | "en" | "en-ZA" | "afrikaans" -> "en" | "af"; null for blank / "auto" / unknown. */
function normalizeLang(value) {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (!v || v === 'auto') return null;
  if (WHISPER_NAMES[v]) return WHISPER_NAMES[v];
  const base = v.split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(base) ? WHISPER_NAMES[base] || base : null;
}

/** "isiZulu" | "Afrikaans" | "English" (the business's preferred language) -> code, or null. */
function businessLanguageCode(name) {
  const lang = preferredLanguage(name);
  return lang ? APP_LANGUAGE_CODES[lang] : null; // a no-longer-offered language falls back to the caller's default
}

/* ---- Guess the language of a piece of text from common words --------------------------------
 * Speech recognition guesses the language from a short clip and is often wrong ("Add Snacks" heard
 * as Afrikaans). The words themselves are a much better clue, so this is the second opinion used
 * when the AI did not tag its answer, and to pick the right voice for what is actually being said.
 * It is deliberately cautious: it returns null unless the evidence is clear. */
const WORDS = {
  en: 'the and is are was were how what when where why who which my your our their his her its this that these those with without for from about of to in on at by add added product products called named quantity price cost much many have has had do does did can could should would will please show tell me i you we they it not no yes there here stock sold sell bought buy customer today tomorrow yesterday sales profit expenses expense record'.split(' '),
  af: 'die en ek jy hy sy ons julle hulle is was nie het my jou ons se van vir met oor om te dit dat wat hoe hoeveel waar wanneer hoekom wie asseblief voeg produk produkte genaamd hoeveelheid prys koste kan sal moet wil gaan nou vandag more gister verkoop gekoop kliënt kliënte winste uitgawes ja nee baie dankie goeie môre middag aand'.split(' '),
  zu: 'ngiyabonga sawubona yebo cha ngicela ngifuna ngingakanani yini kanjani kuphi nini ngubani futhi kodwa uma noma kakhulu mina wena yami lami wakho ngithenge ngithengise ngithengile ngithengisile engeza ukungeza umkhiqizo imikhiqizo okubizwa inani intengo izinto namhlanje kusasa izolo ikhasimende amakhasimende inzuzo izindleko ukuthi nga ukuba ngo ngami kuphela manje'.split(' '),
  xh: 'molo molweni enkosi ndiyabulela ewe hayi ndicela ndifuna ntoni njani phi nini ngubani kwaye kodwa ukuba okanye kakhulu mna wena eyam yakho ndithenge ndithengise ndithengile ndithengisile ongeza ukongeza imveliso ebizwa ixabiso inani izinto namhlanje ngomso izolo umthengi abathengi inzuzo iindleko ukuba ndiyaxolisa'.split(' '),
  st: 'dumela dumelang kea leboha ee tjhe ke batla ka kopo hobaneng joang kae neng mme empa haeba kapa haholo nna wena ya ka ya hao ke rekile ke rekisitse eketsa sehlahisoa theko palo dintho kajeno hosane maobane moreki bareki phaello ditjeho hore'.split(' '),
  tn: 'dumela dumelang ke a leboga ee nnyaa ke batla tsweetswee eng jang kae leng mme fa kana gonne thata nna wena ya me ya gago ke rekile ke rekisitse oketsa sediriswa tlhwatlhwa palo dilo gompieno ka moso maabane moreki barekisi dipoelo ditshenyegelo gore'.split(' '),
  sw: 'habari asante naomba nataka ongeza bei kiasi ndiyo hapana nini gani lini wapi sana na kwa ya wa ni si yangu yako nimenunua nimeuza bidhaa leo kesho jana mteja wateja faida gharama tafadhali'.split(' '),
  sn: 'mhoro ndatenda ndinoda ndapota wedzera mutengo huwandu hongu kwete chii sei kupi rinhi zvikuru ini iwe yangu yako ndatenga ndatengesa chigadzirwa nhasi mangwana nezuro mutengi vatengi purofiti mari'.split(' '),
  fr: 'le la les un une des et est sont je tu il elle nous vous ils avec sans pour de du dans sur par mon ma mes ton ta ce cette ces quoi comment quand où pourquoi qui ajouter ajoute produit appelé quantité prix coût combien merci bonjour oui non aujourd demain hier vente vendu acheté client bénéfice dépenses s\'il vous plaît'.split(' '),
  pt: 'o a os as um uma e é são eu tu ele ela nós vocês eles com sem para de do da no na em por meu minha meus seu sua isto isso que como quando onde porque quem adicionar adiciona produto chamado quantidade preço custo quanto obrigado olá sim não hoje amanhã ontem venda vendido comprado cliente lucro despesas por favor'.split(' '),
  es: 'el la los las un una y es son yo tú él ella nosotros ustedes ellos con sin para de del en por mi mis tu su esto eso que cómo cuándo dónde por qué quién agregar añadir producto llamado cantidad precio costo cuánto gracias hola sí no hoy mañana ayer venta vendido comprado cliente ganancia gastos por favor'.split(' '),
  de: 'der die das ein eine und ist sind ich du er sie wir ihr mit ohne für von zu im in auf bei mein meine dein sein dies das was wie wann wo warum wer hinzufügen produkt genannt menge preis kosten wie viel danke hallo ja nein heute morgen gestern verkauf verkauft gekauft kunde gewinn ausgaben bitte'.split(' '),
};
const WORD_SETS = Object.fromEntries(Object.entries(WORDS).map(([k, v]) => [k, new Set(v)]));
// A word that appears in several languages says little (e.g. "no", "me", "na"), so common clashes are not counted.
const SHARED = new Set(['a', 'e', 'o', 'no', 'me', 'ya', 'ka', 'na', 'i', 'in', 'is', 'on', 'te', 'se', 'si', 'un', 'das', 'die', 'der', 'en', 'nga', 'ke', 'ne', 'ni', 'wa', 'ee']);

/** -> { code, hits, confident } | null */
function guessLanguageDetail(text) {
  const words = String(text || '').toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const score = {};
  for (const w of words) {
    for (const [code, set] of Object.entries(WORD_SETS)) {
      if (set.has(w)) score[code] = (score[code] || 0) + (SHARED.has(w) ? 0.4 : 1);
    }
  }
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  const [code, hits] = ranked[0];
  const second = ranked[1]?.[1] || 0;
  const share = hits / Math.max(words.length, 1);
  const confident = hits >= 2 && hits - second >= 1 && share >= 0.25;
  const single = words.length <= 2 && hits >= 1 && hits - second >= 1; // "Sawubona", "Hello"
  if (!confident && !single) return null;
  return { code, hits, confident: confident || hits >= 3 };
}
const guessLanguage = (text) => guessLanguageDetail(text)?.code || null;

const languageName = (code) => NAMES[normalizeLang(code)] || (normalizeLang(code) ? normalizeLang(code).toUpperCase() : 'the same language');

/** What the person chose for the app's interface ("isiZulu"), from a request. null when blank / not one of ours.
 *  This is the INTERFACE language: it is only a tie-breaker for replies. It is never treated as the language
 *  the person is speaking, and never as a translation request. */
/** The app's interface language sent with a request -> "English" | "Afrikaans" | "isiZulu", or null. */
const interfaceLanguage = (value) => preferredLanguage(value);

module.exports = { NAMES, RECOGNISED, APP_LANGUAGES, normalizeLang, languageName, businessLanguageCode, preferredLanguage, interfaceLanguage, guessLanguage, guessLanguageDetail };
