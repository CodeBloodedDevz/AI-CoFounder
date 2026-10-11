// Pure helpers for appointments ("upcoming work") and customer follow-ups.
// No React in here, so everything can be unit-tested.

const pad = (n) => String(n).padStart(2, '0');

export const WORK_STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled', 'No-show'];
const OPEN_STATUSES = ['Pending', 'Confirmed'];

/* ---------------- dates & times ---------------- */

/** month is 0-based (like JavaScript's Date). */
export const toISO = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;

export const todayISO = (now = new Date()) => toISO(now.getFullYear(), now.getMonth(), now.getDate());

/** "2026-10-12" -> local Date, or null when it isn't a real date. */
export function parseISO(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

export function addDays(iso, days) {
  const d = parseISO(iso);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return toISO(d.getFullYear(), d.getMonth(), d.getDate());
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export { MONTH_NAMES, DAY_NAMES };

/** "Today", "Tomorrow", "Yesterday", otherwise "Mon 12 Oct" (adds the year when it isn't this year). */
export function dayLabel(iso, now = new Date()) {
  const d = parseISO(iso);
  if (!d) return iso || 'No date';
  const today = todayISO(now);
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  if (iso === addDays(today, -1)) return 'Yesterday';
  const base = `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** "Mon 12 Oct 2026" (with "Today · " style prefix for today/tomorrow/yesterday). */
export function longDate(iso, now = new Date()) {
  const d = parseISO(iso);
  if (!d) return iso || '';
  const full = `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  const label = dayLabel(iso, now);
  return ['Today', 'Tomorrow', 'Yesterday'].includes(label) ? `${label} · ${full}` : full;
}

/** Accepts "14:30", "14.30", "1430", "2pm", "2:30 pm", "9". Returns "HH:MM", "" for blank, or null if invalid. */
export function normalizeTime(input) {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return '';
  const m = raw.match(/^(\d{1,2})(?:\s*[:.h]?\s*(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] === undefined ? 0 : Number(m[2]);
  if (m[3]) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (m[3] === 'pm' ? 12 : 0);
  }
  if (hours > 23 || minutes > 59) return null;
  return `${pad(hours)}:${pad(minutes)}`;
}

/** Half-hour slots for the time picker. */
export function timeSlots(from = 6, to = 21, stepMinutes = 30) {
  const out = [];
  for (let mins = from * 60; mins <= to * 60; mins += stepMinutes) out.push(`${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`);
  return out;
}

/** Weeks (Monday first) of a month; each cell is an ISO date or null for padding. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => toISO(year, month, i + 1))];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/* ---------------- appointments ---------------- */

const whenKey = (w) => `${w.date || '9999-99-99'} ${w.time || '99:99'}`;
export const compareByWhen = (a, b) => (whenKey(a) < whenKey(b) ? -1 : whenKey(a) > whenKey(b) ? 1 : 0);

/**
 * Splits appointments into what's still ahead and what's done / past.
 *  upcoming: open (Pending/Confirmed) and today or later, soonest first
 *  past:     everything else, most recent first
 */
export function splitWork(work, now = new Date()) {
  const today = todayISO(now);
  const upcoming = [];
  const past = [];
  (work || []).forEach((w) => {
    if (OPEN_STATUSES.includes(w.status) && w.date && w.date >= today) upcoming.push(w);
    else past.push(w);
  });
  // Most recent first; anything without a date goes to the very end.
  const recentFirst = (a, b) => (!a.date ? (b.date ? 1 : 0) : !b.date ? -1 : compareByWhen(b, a));
  return { upcoming: upcoming.sort(compareByWhen), past: past.sort(recentFirst) };
}

/** Checks the appointment form. Returns { ok, errors, value } where value is cleaned for saving. */
export function validateWork(form, now = new Date()) {
  const errors = {};
  const title = (form.title || '').trim();
  if (!title) errors.title = 'Give this appointment a short title.';
  const date = (form.date || '').trim();
  if (!date) errors.date = 'Pick a date.';
  else if (!parseISO(date)) errors.date = 'That date is not valid.';
  const time = normalizeTime(form.time);
  if (time === null) errors.time = 'Time should look like 14:30 or 2pm.';
  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value: ok
      ? { ...form, title, date, time: time || '', status: form.status || 'Pending' }
      : null,
  };
}

/* ---------------- follow-ups ---------------- */

/** South African numbers -> digits for wa.me / sms ("082 123 4567" -> "27821234567"). Null if it can't be a phone number. */
export function normalizePhone(raw) {
  let digits = String(raw ?? '').replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `27${digits.slice(1)}`;
  else if (digits.length === 9 && /^[678]/.test(digits)) digits = `27${digits}`;
  digits = digits.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export const whatsappUrl = (phone, text) => {
  const n = normalizePhone(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text || '')}` : null;
};

/** iOS wants "&body=", Android and the rest want "?body=". */
export const smsUrl = (phone, text, os = 'android') => {
  const n = normalizePhone(phone);
  return n ? `sms:+${n}${os === 'ios' ? '&' : '?'}body=${encodeURIComponent(text || '')}` : null;
};

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

/** A friendly ready-to-send message. kind: 'followup' | 'reminder'. */
export function followUpMessage({ kind = 'followup', customerName, businessName, service, work, now = new Date() } = {}) {
  const hi = `Hi ${firstName(customerName)}`;
  const from = businessName ? ` from ${businessName}` : '';
  if (kind === 'reminder' && work) {
    const what = work.service || work.title || 'appointment';
    const label = dayLabel(work.date, now);
    const when = label === 'Today' || label === 'Tomorrow' ? label.toLowerCase() : `on ${label}`;
    const at = work.time ? ` at ${work.time}` : '';
    return `${hi}, this is a reminder${from} about your ${what} ${when}${at}. Please reply to confirm, or let us know if you need to reschedule. Thank you!`;
  }
  const again = service ? ` for another ${String(service).toLowerCase()}` : '';
  return `${hi}${from}! We haven't seen you in a while and would love to have you back${again}. Would you like to book a time this week?`;
}

/**
 * Customers worth a message: nobody with an appointment already booked, and
 * nobody who visited recently. Longest gap first; customers with no visits yet
 * come after. `contacted` is { [customerId]: 'YYYY-MM-DD' } so people you
 * messaged in the last `quietDays` days are left alone.
 */
export function followUpList(customers, work, { contacted = {}, now = new Date(), staleAfterDays = 28, quietDays = 7 } = {}) {
  const today = todayISO(now);
  const { upcoming } = splitWork(work, now);
  const booked = new Set(upcoming.map((w) => w.customerId).filter(Boolean));
  const msPerDay = 1000 * 60 * 60 * 24;

  const out = [];
  (customers || []).forEach((customer) => {
    if (booked.has(customer.id)) return;
    const lastContact = contacted[customer.id];
    if (lastContact && lastContact <= today) {
      const sinceContact = Math.round((parseISO(today) - parseISO(lastContact)) / msPerDay);
      if (sinceContact < quietDays) return;
    }
    const visits = (work || [])
      .filter((w) => w.customerId === customer.id && w.status === 'Completed' && parseISO(w.date))
      .sort(compareByWhen);
    const last = visits[visits.length - 1];
    if (!last) {
      out.push({ customer, daysSince: null, lastService: null, reason: 'No visits recorded yet' });
      return;
    }
    const daysSince = Math.round((parseISO(today) - parseISO(last.date)) / msPerDay);
    if (daysSince < staleAfterDays) return;
    const weeks = Math.round(daysSince / 7);
    out.push({ customer, daysSince, lastService: last.service || null, reason: `Last visit ${weeks} week${weeks === 1 ? '' : 's'} ago` });
  });

  return out.sort((a, b) => (b.daysSince ?? -1) - (a.daysSince ?? -1));
}
