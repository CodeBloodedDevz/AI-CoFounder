// Pure helpers for the Sponsored screens (no React Native imports, so they are easy to test).
// The server holds the real rules (backend/src/lib/sponsoredRules.js); these only shape what is shown.

// Same ids as the server; labels are translated (sponsored.category.<id>).
export const CATEGORY_IDS = ['fashion', 'design', 'marketing', 'tech', 'beauty', 'food', 'retail', 'professional', 'trades', 'education', 'events', 'health', 'transport', 'other'];

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Pill tones (components/ui.js) for each advert status the server reports.
export const STATUS_TONE = {
  active: 'success',
  scheduled: 'accent',
  pending_review: 'accent',
  awaiting_payment: 'crimson',
  rejected: 'danger',
  suspended: 'danger',
  removed: 'danger',
  expired: 'neutral',
  withdrawn: 'neutral',
};
export const statusTone = (status) => STATUS_TONE[status] || 'neutral';

/** Days left at which the owner is reminded to renew. */
export const EXPIRY_WARNING_DAYS = 3;
export const endsSoon = (ad) => ad?.status === 'active' && ad.daysLeft != null && ad.daysLeft <= EXPIRY_WARNING_DAYS;

/** The order of adverts rotates per person per day (so everyone gets a fair turn), but stays put while scrolling. */
export function dailySeed(userKey, date = new Date()) {
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `${String(userKey || 'guest').slice(0, 24)}:${d}`;
}

/** What still has to be filled in before a business page can be shown (translation keys). Mirrors the server. */
export function profileProblemKeys(p) {
  const out = [];
  if (!p || String(p.displayName || '').trim().length < 2) out.push('sponsored.page.needName');
  if (!p || String(p.about || '').trim().length < 30) out.push('sponsored.page.needAbout');
  if (!p || !(p.whatsapp || p.phone || p.email || p.website)) out.push('sponsored.page.needContact');
  return out;
}

/**
 * Collects views and taps and sends them in small batches (one request every few seconds instead of one per
 * card). Each advert/kind is sent once per screen visit; the server also counts each person once a day.
 *   const q = createEventQueue({ send: (events) => api.events(events) });
 *   q.add(adId, 'impression');  ...  q.flush();
 */
export function createEventQueue({ send, delayMs = 2500, max = 50, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const sent = new Set();
  let pending = [];
  let timer = null;
  const flush = () => {
    if (timer) clearTimer(timer);
    timer = null;
    if (!pending.length) return;
    const batch = pending.slice(0, max);
    pending = pending.slice(max);
    Promise.resolve(send(batch)).catch(() => {});
    if (pending.length) timer = setTimer(flush, delayMs);
  };
  return {
    add(adId, type) {
      const key = `${adId}|${type}`;
      if (!adId || sent.has(key)) return false;
      sent.add(key);
      pending.push({ adId, type });
      if (pending.length >= max) flush();
      else if (!timer) timer = setTimer(flush, delayMs);
      return true;
    },
    flush,
    get size() { return pending.length; },
  };
}

/** expo-image-picker asset -> "data:image/...;base64,..." (web may already give a data URL). */
export function imageDataUrl(asset) {
  if (!asset) return null;
  if (asset.base64) return `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`;
  if (typeof asset.uri === 'string' && asset.uri.startsWith('data:image/')) return asset.uri;
  return null;
}

/** "27821234567" -> "+27 82 123 4567" for display (other countries: "+<digits>"). */
export function displayPhone(value) {
  const d = String(value || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('27') && d.length === 11) return `+27 ${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return `+${d}`;
}

/** Initials for a business without a logo. */
export const initialsOf = (name) => String(name || '').split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'B';
