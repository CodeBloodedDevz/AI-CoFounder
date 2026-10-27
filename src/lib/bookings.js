// Booking states and customer appointment history, worked out from the booking records themselves
// (never from separate counters), so every screen shows the same numbers after a refresh or new login.
// Pure functions: no React, easy to test. The server applies the same rules (backend/src/lib/bookings.js).
//
//   stored status   state shown
//   Pending         scheduled   (upcoming)
//   Confirmed       confirmed   (upcoming)
//   Pending/Conf.   awaiting    the appointment is over but nobody recorded what happened yet
//   Completed       completed   the ONLY state that counts as a visit
//   No-show         missed
//   Cancelled       cancelled
// A booking moved to another date/time keeps its state and shows "Rescheduled" (rescheduledFrom).
//
// Nothing is marked missed automatically. An unfinished booking whose time has passed (for example
// while the app was closed) is shown as "Needs an outcome" until the business marks it Completed or Missed.
import { OPEN_STATUSES, parseISO, todayISO } from './schedule';
import { parseDurationMinutes } from './aiEngine';

export { OPEN_STATUSES };
export const MISSED_GRACE_MINUTES = 15; // the earliest an appointment can be marked missed: start + 15 min
export const OUTCOME_GRACE_MINUTES = 30; // after the appointment should have ended, ask for an outcome
const DEFAULT_DURATION = 60;

export const isOpen = (w) => OPEN_STATUSES.includes(w?.status);
export const isCompleted = (w) => w?.status === 'Completed';
export const isMissed = (w) => w?.status === 'No-show';
export const isCancelled = (w) => w?.status === 'Cancelled';

const minutesOf = (time) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const nowMinutes = (now) => now.getHours() * 60 + now.getMinutes();

/** How long the booked service takes (minutes), from the service list; 60 when unknown. */
export function durationOf(work, services = []) {
  const s = services.find((x) => x.name === work?.service);
  return s?.duration ? parseDurationMinutes(s.duration) || DEFAULT_DURATION : DEFAULT_DURATION;
}

/** Has the appointment's time passed by `graceMinutes`? A booking without a time counts from that day on. */
function startedBy(work, now, graceMinutes) {
  const today = todayISO(now);
  if (!work?.date) return false;
  if (work.date < today) return true;
  if (work.date > today) return false;
  const start = minutesOf(work.time);
  return start === null ? true : nowMinutes(now) >= start + graceMinutes;
}

/** Can the business record this booking as Missed? (Same rule as the server.) */
export const canMarkMissed = (work, now = new Date()) => isOpen(work) && startedBy(work, now, MISSED_GRACE_MINUTES);

/** Can it be marked Completed? Only on or after its day. */
export const canComplete = (work, now = new Date()) => !isCompleted(work) && !isCancelled(work) && Boolean(work?.date) && work.date <= todayISO(now);

/** Open, and its end time (start + duration + grace) has passed: someone needs to record the outcome. */
export function needsOutcome(work, now = new Date(), services = []) {
  if (!isOpen(work) || !work.date) return false;
  const today = todayISO(now);
  if (work.date < today) return true;
  if (work.date > today) return false;
  const start = minutesOf(work.time);
  if (start === null) return false; // an all-day booking is still on today
  return nowMinutes(now) >= start + durationOf(work, services) + OUTCOME_GRACE_MINUTES;
}

/** 'scheduled' | 'confirmed' | 'awaiting' | 'completed' | 'missed' | 'cancelled' */
export function bookingState(work, now = new Date(), services = []) {
  if (isCompleted(work)) return 'completed';
  if (isMissed(work)) return 'missed';
  if (isCancelled(work)) return 'cancelled';
  if (needsOutcome(work, now, services)) return 'awaiting';
  return work?.status === 'Confirmed' ? 'confirmed' : 'scheduled';
}

const whenKey = (w) => `${w.date || '9999-99-99'} ${w.time || '99:99'}`;
const soonestFirst = (a, b) => whenKey(a).localeCompare(whenKey(b));
const latestFirst = (a, b) => whenKey(b).localeCompare(whenKey(a));

/**
 * Splits bookings for the Manage bookings screen.
 *   needsOutcome: unfinished bookings whose time is over (oldest first)
 *   upcoming:     unfinished bookings still to come (soonest first)
 *   history:      completed, missed and cancelled (most recent first)
 */
export function splitBookings(work, now = new Date(), services = []) {
  const needs = [];
  const upcoming = [];
  const history = [];
  (work || []).forEach((w) => {
    if (isOpen(w)) (needsOutcome(w, now, services) ? needs : upcoming).push(w);
    else history.push(w);
  });
  return { needsOutcome: needs.sort(soonestFirst), upcoming: upcoming.sort(soonestFirst), history: history.sort(latestFirst) };
}

/**
 * A customer's appointment history and summary, from their booking records.
 * -> { visits, upcoming, awaiting, missed, cancelled, total, lastVisit, nextBooking, spent, items }
 *   visits     completed bookings (each booking counts once, whatever else happens to it)
 *   upcoming   unfinished bookings still to come; awaiting: unfinished ones whose time is over
 *   lastVisit  the most recent completed booking; nextBooking the soonest upcoming one
 *   spent      completed visits × the service's price
 */
export function customerHistory(customerId, work, { now = new Date(), services = [], transactions = null } = {}) {
  const mine = (work || []).filter((w) => customerId && w.customerId === customerId);
  const completed = mine.filter(isCompleted);
  const { needsOutcome: awaiting, upcoming } = splitBookings(mine, now, services);
  // Spent = the income actually recorded for this customer's completed bookings (tips and corrections
  // included); a completed booking without recorded income counts at its agreed price.
  const incomeByBooking = new Map();
  (transactions || []).forEach((t) => {
    if (t.type === 'sale' && t.bookingId) incomeByBooking.set(t.bookingId, (incomeByBooking.get(t.bookingId) || 0) + Number(t.amount || 0));
  });
  const price = (w) => {
    if (incomeByBooking.has(w.id)) return incomeByBooking.get(w.id);
    if (w.price != null && w.price > 0) return Number(w.price);
    return Number(services.find((s) => s.name === w.service)?.price || 0);
  };
  return {
    visits: completed.length,
    upcoming: upcoming.length,
    awaiting: awaiting.length,
    missed: mine.filter(isMissed).length,
    cancelled: mine.filter(isCancelled).length,
    total: mine.length,
    lastVisit: [...completed].sort(latestFirst)[0] || null,
    nextBooking: upcoming[0] || null,
    spent: completed.reduce((sum, w) => sum + price(w), 0),
    items: [...mine].sort(latestFirst),
  };
}

/** Is there already an unfinished or completed booking for this customer at that slot? (Server checks too.) */
export function findDuplicateBooking(work, { customerId, date, time, service, title }, excludeId) {
  if (!customerId || !date) return null;
  const norm = (s) => String(s || '').trim().toLowerCase();
  return (
    (work || []).find(
      (w) =>
        w.id !== excludeId &&
        w.customerId === customerId &&
        w.date === date &&
        ['Pending', 'Confirmed', 'Completed'].includes(w.status) &&
        (time && w.time ? w.time === time : norm(w.service || w.title) === norm(service || title))
    ) || null
  );
}

/** Statuses a booking can be given in the booking form (outcomes are recorded with the row's buttons). */
export function formStatusOptions(date, now = new Date()) {
  const d = parseISO(date);
  if (!d) return OPEN_STATUSES;
  const today = todayISO(now);
  if (date < today) return ['Completed']; // a past date can only be logged as a visit that happened
  return date === today ? [...OPEN_STATUSES, 'Completed'] : OPEN_STATUSES;
}
