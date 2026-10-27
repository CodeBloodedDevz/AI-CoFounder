// Appointment reminders: what to remind about, and when. Pure functions (no device APIs), so they can be
// tested; lib/notifications.js hands the result to the phone's notification scheduler.
//
// A booking stores its reminders as short codes (upcoming_work.reminders):
//   'd0'  on the day of the appointment (08:00, or 1 hour before if it starts before 09:00)
//   'd1'  1 day before at 08:00          'dN'  N days before at 08:00 (1–60)
//   'hN'  N hours before the start time (1–72)
// []   reminders turned off for this booking.   null: never set (older bookings), treated as off.
//
// Times are the phone's local time: new Date(year, month, day, hour, minute) is local, so a reminder follows
// the device's time zone, and is re-worked out when the app opens (a changed zone or date moves it).
import { parseISO } from './schedule';

export const PRESET_REMINDERS = ['d0', 'd1', 'd2', 'd3'];
export const DEFAULT_REMINDERS = ['d1'];
export const MAX_REMINDERS_PER_BOOKING = 5;
// iOS keeps at most 64 pending local notifications per app; stay under it (soonest first).
export const MAX_SCHEDULED = 60;
const DAY_REMINDER_HOUR = 8;
const OPEN = ['Pending', 'Confirmed'];

/** 'd2' -> { kind: 'day', n: 2 }; 'h3' -> { kind: 'hour', n: 3 }; null when it isn't a valid code. */
export function parseReminder(code) {
  const m = /^([dh])(\d{1,2})$/.exec(String(code || '').trim());
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] === 'd' && n >= 0 && n <= 60) return { kind: 'day', n };
  if (m[1] === 'h' && n >= 1 && n <= 72) return { kind: 'hour', n };
  return null;
}

/** Valid, unique codes, earliest reminder first (most days / hours before first), at most 5. */
export function normalizeReminders(list) {
  if (!Array.isArray(list)) return [];
  const minutesBefore = (c) => {
    const r = parseReminder(c);
    return r.kind === 'day' ? r.n * 1440 + 600 : r.n * 60; // a day reminder sorts as earlier than hour ones that day
  };
  return [...new Set(list.map((c) => String(c).trim()).filter((c) => parseReminder(c)))]
    .sort((a, b) => minutesBefore(b) - minutesBefore(a))
    .slice(0, MAX_REMINDERS_PER_BOOKING);
}

/** When the appointment starts, in local time. A booking without a time counts from 08:00. */
export function appointmentStart(work) {
  const d = parseISO(work?.date);
  if (!d) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(work.time || ''));
  return m ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(m[1]), Number(m[2])) : new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_REMINDER_HOUR, 0);
}

/** When one reminder fires (local time), or null. */
export function reminderTime(work, code) {
  const r = parseReminder(code);
  const start = appointmentStart(work);
  if (!r || !start) return null;
  if (r.kind === 'hour') return new Date(start.getTime() - r.n * 3600_000);
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() - r.n, DAY_REMINDER_HOUR, 0);
  // "On the day" must come before the appointment: for an early start, remind an hour before instead.
  if (r.n === 0 && day.getTime() >= start.getTime() - 3600_000) return new Date(start.getTime() - 3600_000);
  return day;
}

/** Reminder text, e.g. "1 day before" (uses the app's translator). */
export function reminderLabel(code, t) {
  const r = parseReminder(code);
  if (!r) return code;
  if (r.kind === 'hour') return t('reminders.hoursBefore', { count: r.n });
  return r.n === 0 ? t('reminders.onTheDay') : t('reminders.daysBefore', { count: r.n });
}

const two = (n) => String(n).padStart(2, '0');

/**
 * Every reminder that should be waiting on this phone right now, soonest first (at most MAX_SCHEDULED).
 * Only unfinished bookings (Scheduled / Confirmed) with reminders on, and only reminder times still ahead.
 *   -> [{ id, bookingId, code, fireAt: Date, title, body, data }]
 * `id` changes whenever anything shown or the time changes, so an edited booking is rescheduled.
 */
export function plannedReminders(work, { customers = [], businessName = '', now = new Date(), t, formatWhen } = {}) {
  const out = [];
  (work || []).forEach((w) => {
    if (!OPEN.includes(w.status)) return; // completed, missed, cancelled: nothing left to remind about
    const codes = normalizeReminders(w.reminders);
    if (!codes.length) return;
    const start = appointmentStart(w);
    if (!start || start.getTime() <= now.getTime()) return;
    const customer = customers.find((c) => c.id === w.customerId);
    const what = w.service || w.title || t('workRow.appointment');
    const when = formatWhen ? formatWhen(w) : `${w.date}${w.time ? ` ${w.time}` : ''}`;
    codes.forEach((code) => {
      const fireAt = reminderTime(w, code);
      if (!fireAt || fireAt.getTime() <= now.getTime() + 30_000) return; // already passed (or about to)
      const r = parseReminder(code);
      const title =
        r.kind === 'hour'
          ? t('reminders.notifTitleSoon', { what, count: r.n })
          : r.n === 0
          ? t('reminders.notifTitleToday', { what, time: w.time || '' })
          : r.n === 1
          ? t('reminders.notifTitleTomorrow', { what })
          : t('reminders.notifTitleDays', { what, count: r.n });
      const body = [customer?.name ? t('reminders.notifWith', { name: customer.name }) : null, when, businessName || null].filter(Boolean).join(' · ');
      const stamp = `${fireAt.getFullYear()}${two(fireAt.getMonth() + 1)}${two(fireAt.getDate())}${two(fireAt.getHours())}${two(fireAt.getMinutes())}`;
      out.push({
        id: `appt-${w.id}-${code}-${stamp}-${hash(title + body)}`,
        bookingId: w.id,
        code,
        fireAt,
        title,
        body,
        data: { type: 'appointment-reminder', bookingId: w.id },
      });
    });
  });
  return out.sort((a, b) => a.fireAt - b.fireAt).slice(0, MAX_SCHEDULED);
}

/**
 * What the booking's reminders are doing, for its row / details:
 *   { state: 'scheduled', next }  reminders will arrive (next = the soonest)
 *   { state: 'off' }              reminders turned off for this booking
 *   { state: 'passed' }           reminders are on but their times have gone by
 *   { state: 'notNeeded' }        completed, missed or cancelled: nothing to remind about
 * The caller adds whether this device can show them (permission, web).
 */
export function reminderStatus(work, now = new Date()) {
  if (!OPEN.includes(work?.status)) return { state: 'notNeeded' };
  const codes = normalizeReminders(work.reminders);
  if (!codes.length) return { state: 'off' };
  const start = appointmentStart(work);
  const upcoming = codes.map((c) => reminderTime(work, c)).filter((d) => d && d > now && start && start > now).sort((a, b) => a - b);
  return upcoming.length ? { state: 'scheduled', next: upcoming[0], count: upcoming.length } : { state: 'passed' };
}

// Short, stable fingerprint of the text (so changed wording reschedules a reminder).
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
