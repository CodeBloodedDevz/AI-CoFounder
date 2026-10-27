// The rules of the Sponsored page, as pure functions (no database), so they are easy to test and the app's
// routes, the admin portal and the payment code all apply exactly the same ones.
//
//   validation   what an advert and a business page may contain (lengths, links, WhatsApp numbers, images)
//   lifecycle    which adverts are live, scheduled or expired at a given moment
//   ordering     priority > featured > standard, with fair rotation inside each tier
//   moderation   automatic warnings shown to the reviewing admin (they never approve or reject by themselves)

const crypto = require('node:crypto');
const { badRequest, cleanText } = require('./http');

/* --------------------------------- constants --------------------------------- */

// Stored ids never change; the app translates the labels (sponsored.category.<id>).
const CATEGORIES = [
  { id: 'fashion', label: 'Clothing & fashion' },
  { id: 'design', label: 'Design & creative' },
  { id: 'marketing', label: 'Marketing & advertising' },
  { id: 'tech', label: 'Web & tech' },
  { id: 'beauty', label: 'Beauty & wellness' },
  { id: 'food', label: 'Food & catering' },
  { id: 'retail', label: 'Retail & spaza' },
  { id: 'professional', label: 'Professional services' },
  { id: 'trades', label: 'Building & trades' },
  { id: 'education', label: 'Education & training' },
  { id: 'events', label: 'Events & entertainment' },
  { id: 'health', label: 'Health & fitness' },
  { id: 'transport', label: 'Transport & logistics' },
  { id: 'other', label: 'Other' },
];
const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
const isCategory = (v) => CATEGORY_IDS.includes(v);

const PLACEMENT_RANK = { standard: 1, featured: 2, priority: 3 };
const EVENTS = ['impression', 'click', 'detail_view', 'website_click', 'whatsapp_click', 'call_click', 'email_click'];
const REPORT_REASONS = ['misleading', 'inappropriate', 'spam', 'impersonation', 'other'];

// Statuses in which an advert still "takes a slot" for the business (used for the open-advert limit).
const OPEN_STATUSES = ['awaiting_payment', 'pending_review', 'rejected', 'approved', 'suspended'];
// Statuses in which the owner edits the advert directly (nobody can see it yet).
const DIRECT_EDIT_STATUSES = ['awaiting_payment', 'pending_review', 'rejected'];

const LIMITS = {
  title: 60,
  description: 280,
  displayName: 80,
  about: 1200,
  location: 200,
  hours: 200,
  offeringName: 80,
  offerings: 20,
  url: 200,
  email: 120,
  maxOpenAdsPerBusiness: 5,
};

/* --------------------------------- validation --------------------------------- */

/** Keeps paragraph breaks (unlike cleanText) but trims each line and collapses runs of blank lines. */
function cleanMultiline(value, max) {
  if (value === undefined || value === null) return undefined;
  return String(value)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** "mybrand.co.za" -> "https://mybrand.co.za". Only http(s) web addresses with a real domain; '' clears. */
function normalizeUrl(value, label = 'Website') {
  if (value === undefined || value === null) return undefined;
  let s = String(value).trim();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw badRequest(`${label} is not a valid web address.`);
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw badRequest(`${label} must start with http:// or https://.`);
  if (u.username || u.password) throw badRequest(`${label} must not contain a login.`);
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname) || /^\d+(\.\d+)+$/.test(u.hostname)) throw badRequest(`${label} must use a domain name, e.g. mybusiness.co.za.`);
  const out = u.toString();
  if (out.length > LIMITS.url) throw badRequest(`${label} is too long.`);
  return out;
}

/**
 * Phone / WhatsApp numbers as digits with the country code (what wa.me needs).
 *   "082 123 4567" -> "27821234567"   (a South African number written locally)
 *   "+27 82 123 4567" / "0027821234567" -> "27821234567"
 *   "+44 7700 900123" -> "447700900123"
 * '' clears. Anything else is refused.
 */
function normalizePhone(value, label = 'Phone number') {
  if (value === undefined || value === null) return undefined;
  const raw = String(value).trim();
  if (!raw) return '';
  if (/[^\d\s+()\-.]/.test(raw)) throw badRequest(`${label} may only contain digits, spaces and +.`);
  let d = raw.replace(/\D/g, '');
  if (raw.startsWith('00')) d = d.slice(2);
  else if (!raw.startsWith('+') && /^0\d{9}$/.test(d)) d = `27${d.slice(1)}`; // local SA number
  if (d.startsWith('27') && d.length !== 11) throw badRequest(`${label} doesn't look like a South African number (e.g. 082 123 4567).`);
  if (d.length < 8 || d.length > 15 || d.startsWith('0')) throw badRequest(`${label} doesn't look like a valid number. Include the country code, e.g. +27 82 123 4567.`);
  return d;
}

function normalizeEmail(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim().toLowerCase();
  if (!s) return '';
  if (s.length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw badRequest('Email address is not valid.');
  return s;
}

/** Images must be files uploaded through our own media endpoint (never a link to someone else's site, whose
 *  picture could be swapped after an admin approved it). */
function isOwnMediaUrl(url, mediaBase) {
  if (!url || !mediaBase) return false;
  const base = String(mediaBase).replace(/\/+$/, '');
  return String(url).startsWith(`${base}/`) && /^[a-z0-9/_-]+\.(png|jpe?g|webp)$/i.test(String(url).slice(base.length + 1));
}
function checkImage(value, mediaBase, label = 'Image') {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const s = String(value).trim();
  if (!isOwnMediaUrl(s, mediaBase)) throw badRequest(`${label} must be uploaded in the app.`);
  return s;
}

/** Advert fields from a request body (only the ones sent). `partial` = editing. */
function adFields(body, { mediaBase, partial = false } = {}) {
  const b = body || {};
  const out = {};
  const title = cleanText(b.title, LIMITS.title);
  if (title !== undefined) out.title = title;
  const description = cleanMultiline(b.description, LIMITS.description);
  if (description !== undefined) out.description = description;
  if (b.category !== undefined) {
    if (!isCategory(b.category)) throw badRequest('Choose a category for your advert.');
    out.category = b.category;
  }
  const image = checkImage(b.imageUrl, mediaBase, 'The advert picture');
  if (image !== undefined) out.image_url = image;

  if (!partial || out.title !== undefined) if (!out.title || out.title.length < 3) throw badRequest('Give your advert a title (at least 3 characters).');
  if (!partial || out.description !== undefined) if (!out.description || out.description.length < 20) throw badRequest('Describe what you offer in at least 20 characters.');
  if (!partial && !out.category) throw badRequest('Choose a category for your advert.');
  return out;
}

function cleanOfferings(list) {
  if (list === undefined) return undefined;
  if (!Array.isArray(list)) throw badRequest('Products and services must be a list.');
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const name = cleanText(item?.name, LIMITS.offeringName);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const kind = item?.kind === 'service' ? 'service' : 'product';
    let price = item?.price;
    if (price === '' || price === undefined || price === null) price = null;
    else {
      price = Number(String(price).replace(/[^\d.]/g, ''));
      if (!Number.isFinite(price) || price < 0 || price > 10_000_000) throw badRequest(`The price of "${name}" is not valid.`);
      price = Math.round(price * 100) / 100;
    }
    out.push({ name, kind, price });
    if (out.length >= LIMITS.offerings) break;
  }
  return out;
}

const PROFILE_KEYS = ['displayName', 'about', 'logoUrl', 'category', 'location', 'hours', 'website', 'whatsapp', 'phone', 'email', 'instagram', 'facebook', 'offerings'];

/** The business page from a request body, merged over the current draft (only fields sent change). */
function profileFields(body, current = {}, { mediaBase } = {}) {
  const b = body || {};
  const p = { ...emptyProfile(), ...(current || {}) };
  const set = (k, v) => { if (v !== undefined) p[k] = v; };
  set('displayName', cleanText(b.displayName, LIMITS.displayName));
  set('about', cleanMultiline(b.about, LIMITS.about));
  set('location', cleanText(b.location, LIMITS.location));
  set('hours', cleanText(b.hours, LIMITS.hours));
  if (b.category !== undefined) {
    if (b.category && !isCategory(b.category)) throw badRequest('Choose a category from the list.');
    p.category = b.category || '';
  }
  if (b.logoUrl !== undefined) p.logoUrl = checkImage(b.logoUrl, mediaBase, 'The logo') || '';
  set('website', normalizeUrl(b.website, 'Website'));
  set('instagram', normalizeUrl(b.instagram, 'Instagram link'));
  set('facebook', normalizeUrl(b.facebook, 'Facebook link'));
  set('whatsapp', normalizePhone(b.whatsapp, 'WhatsApp number'));
  set('phone', normalizePhone(b.phone, 'Phone number'));
  set('email', normalizeEmail(b.email));
  set('offerings', cleanOfferings(b.offerings));
  return p;
}

function emptyProfile() {
  return { displayName: '', about: '', logoUrl: '', category: '', location: '', hours: '', website: '', whatsapp: '', phone: '', email: '', instagram: '', facebook: '', offerings: [] };
}

/** What a business page needs before it can be shown to anyone. -> list of problems ([] = complete). */
function profileProblems(p) {
  const problems = [];
  if (!p || !p.displayName || p.displayName.length < 2) problems.push('Add your business name.');
  if (!p || !p.about || p.about.length < 30) problems.push('Describe your business in at least 30 characters.');
  if (!p || !(p.whatsapp || p.phone || p.email || p.website)) problems.push('Add at least one way to contact you (WhatsApp, phone, email or website).');
  return problems;
}

const sameProfile = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);

/* --------------------------------- lifecycle --------------------------------- */

/**
 * The status as people should understand it right now:
 *   approved + before starts_at -> 'scheduled', between -> 'active', after ends_at -> 'expired'.
 */
function effectiveStatus(ad, now = Date.now()) {
  if (!ad) return null;
  if (ad.status !== 'approved') return ad.status;
  const start = Date.parse(ad.starts_at);
  const end = Date.parse(ad.ends_at);
  if (Number.isFinite(end) && now >= end) return 'expired';
  if (Number.isFinite(start) && now < start) return 'scheduled';
  return 'active';
}

/** Shown on the Sponsored page right now: approved, paid / included, inside its dates, owner not suspended. */
const isLive = (ad, now = Date.now()) => Boolean(ad && !ad.account_suspended && effectiveStatus(ad, now) === 'active');

/** Whole days left (rounded up) until ends_at, or null. */
function daysLeft(ad, now = Date.now()) {
  const end = Date.parse(ad?.ends_at);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, Math.ceil((end - now) / 86_400_000));
}

/** Campaign dates for an advert approved at `startMs`. */
function campaignWindow(durationDays, startMs = Date.now()) {
  const start = new Date(startMs);
  const end = new Date(startMs + Number(durationDays) * 86_400_000);
  return { starts_at: start.toISOString(), ends_at: end.toISOString() };
}

/** 'YYYY-MM-DD' (SA) -> 'YYYY-MM': the month a Premium allowance belongs to. */
const includedPeriod = (saDay) => String(saDay).slice(0, 7);

/** What a plan allows for advertising (from lib/plans entitlements). */
function adEligibility(entitlements) {
  const e = entitlements || {};
  return { canPurchase: Boolean(e.adPurchase), includedPerMonth: Number(e.adsIncludedPerMonth) || 0 };
}

/** Applies an approved revision to an advert row. */
function applyChanges(ad, changes) {
  const out = { ...ad };
  for (const k of ['title', 'description', 'image_url', 'category']) if (changes && changes[k] !== undefined) out[k] = changes[k];
  return out;
}

/* --------------------------------- ordering --------------------------------- */

function hashSeed(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** The same seed always gives the same order (so page 2 continues page 1); different seeds rotate fairly. */
function seededShuffle(list, seed) {
  const rnd = mulberry32(hashSeed(seed));
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Splits live adverts into the featured strip (priority first, then featured) and the main list (standard),
 * each rotated by `seed` so every advertiser in a tier gets a fair turn at the top.
 */
function arrangeAds(ads, seed) {
  const tier = (p) => ads.filter((a) => a.placement === p);
  return {
    featured: [...seededShuffle(tier('priority'), `${seed}:p`), ...seededShuffle(tier('featured'), `${seed}:f`)],
    standard: seededShuffle(tier('standard'), `${seed}:s`),
  };
}

/* --------------------------------- moderation --------------------------------- */

const RISKY_PHRASES = [
  /guarantee[ds]? (income|returns?|profit|money)/i,
  /get rich/i,
  /double your (money|investment)/i,
  /risk[- ]free (investment|returns?)/i,
  /\b(forex|crypto|bitcoin)\b.*\b(profit|returns?|signals?)\b/i,
  /make R?\s?\d[\d\s,]*\s*(a|per) (day|week)/i,
  /\bloan\b.*\b(no credit check|blacklisted)\b/i,
  /\b(miracle|100% (cure|guaranteed))\b/i,
  /\b(stokvel|pyramid|ponzi|investment club)\b/i,
];

const normName = (s) => String(s || '').toLowerCase().replace(/\b(pty|ltd|cc|inc|the)\b/g, '').replace(/[^a-z0-9]/g, '');

/**
 * Automatic checks shown to the admin who reviews an advert. They only warn; a person decides.
 *   -> [{ code, level: 'warning' | 'info', message }]
 */
function moderationFlags({ ad, profile, registeredName, similarAds = [], openReports = 0 }) {
  const flags = [];
  const text = `${ad?.title || ''}\n${ad?.description || ''}\n${profile?.about || ''}`;
  if (RISKY_PHRASES.some((re) => re.test(text))) flags.push({ code: 'risky_claims', level: 'warning', message: 'Contains wording often used in misleading money or health claims. Check it is truthful.' });
  const letters = (ad?.title || '').replace(/[^a-z]/gi, '');
  if (letters.length >= 8 && letters === letters.toUpperCase()) flags.push({ code: 'shouting', level: 'info', message: 'The title is written in capital letters.' });
  if ((text.match(/https?:\/\/|www\./gi) || []).length > 1) flags.push({ code: 'links_in_text', level: 'info', message: 'Links are written in the text instead of the website field.' });
  if ((text.match(/(\+?\d[\d\s-]{8,}\d)/g) || []).length > 0) flags.push({ code: 'numbers_in_text', level: 'info', message: 'A phone number is written in the text instead of the contact fields.' });
  if (/(.)\1{5,}/.test(text) || /(!|\?){3,}/.test(text)) flags.push({ code: 'spammy', level: 'info', message: 'Repeated characters or punctuation (often spam).' });
  if (profile?.displayName && registeredName && normName(profile.displayName) && normName(registeredName)) {
    const a = normName(profile.displayName);
    const b = normName(registeredName);
    if (!a.includes(b) && !b.includes(a)) {
      flags.push({ code: 'name_differs', level: 'warning', message: `The public name "${profile.displayName}" differs from the registered business name "${registeredName}". Make sure it isn't another company's name.` });
    }
  }
  if (similarAds.length) flags.push({ code: 'duplicate', level: 'warning', message: `A very similar advert is used by ${similarAds.length === 1 ? 'another business' : `${similarAds.length} other businesses`}: ${similarAds.slice(0, 3).map((s) => s.businessName || 'unknown').join(', ')}.` });
  if (!ad?.image_url && !profile?.logoUrl) flags.push({ code: 'no_image', level: 'info', message: 'No picture or logo: the advert will show the business initials.' });
  if (openReports > 0) flags.push({ code: 'reported', level: 'warning', message: `${openReports} open report${openReports === 1 ? '' : 's'} from users.` });
  return flags;
}

/* --------------------------------- misc --------------------------------- */

/** Anonymous, stable id for a viewer (dedupes views and reports without storing who it was). */
function viewerHash(userId, secret) {
  return crypto.createHmac('sha256', String(secret || 'sponsored')).update(String(userId)).digest('hex').slice(0, 32);
}

const whatsappLink = (digits, text = '') => (digits ? `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}` : null);

module.exports = {
  CATEGORIES, CATEGORY_IDS, isCategory, PLACEMENT_RANK, EVENTS, REPORT_REASONS, OPEN_STATUSES, DIRECT_EDIT_STATUSES, LIMITS, PROFILE_KEYS,
  cleanMultiline, normalizeUrl, normalizePhone, normalizeEmail, isOwnMediaUrl, checkImage, adFields, profileFields, emptyProfile, profileProblems, sameProfile,
  effectiveStatus, isLive, daysLeft, campaignWindow, includedPeriod, adEligibility, applyChanges,
  seededShuffle, arrangeAds, moderationFlags, viewerHash, whatsappLink,
};
