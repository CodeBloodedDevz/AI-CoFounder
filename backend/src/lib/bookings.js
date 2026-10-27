// Booking (upcoming_work) rules, shared by the REST routes (/work) and the AI assistant's tools, so a
// booking follows the same rules however it is created or changed.
//
// Stored status        Shown in the app as
//   Pending            Scheduled   (upcoming, not yet confirmed with the customer)
//   Confirmed          Confirmed   (upcoming, customer confirmed)
//   Completed          Completed   (the visit happened; this is the ONLY status that counts as a visit)
//   No-show            Missed      (the time passed and the customer did not come)
//   Cancelled          Cancelled
// "Rescheduled" is not a status of its own: a booking whose date or time was moved keeps being
// Scheduled / Confirmed and remembers where it was moved from (rescheduled_from, reschedule_count).
//
// Visits, missed and cancelled counts are always worked out from these rows (never stored as counters),
// so they cannot drift: completing a booking twice, refreshing or editing it never adds a second visit.

const supabase = require('../supabaseClient');
const { HttpError, ok, badRequest, notFound, cleanText, isIsoDate, isUuid, parseNumber } = require('./http');
const { ensureIncome, removeIncome, bookingPrice } = require('./bookingIncome');

const STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled', 'No-show'];
const OPEN = ['Pending', 'Confirmed'];
const MISSED_GRACE_MINUTES = () => {
  const n = Number(process.env.MISSED_GRACE_MINUTES);
  return Number.isFinite(n) && n >= 0 ? n : 15;
};

const ALIASES = {
  pending: 'Pending', scheduled: 'Pending', upcoming: 'Pending', booked: 'Pending', rescheduled: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed', complete: 'Completed', done: 'Completed', attended: 'Completed',
  cancelled: 'Cancelled', canceled: 'Cancelled',
  'no-show': 'No-show', noshow: 'No-show', 'no show': 'No-show', missed: 'No-show',
};
/** "Missed" | "scheduled" | "Completed" -> stored status, or null when it isn't one. */
function normalizeStatus(value) {
  if (typeof value !== 'string') return null;
  return ALIASES[value.trim().toLowerCase()] || null;
}

/** "14:30" | "2pm" | "9" | "1430" -> "HH:MM"; "" for blank; null when it isn't a time. (Same as the app.) */
function normalizeTime(input) {
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
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** The current date and minute of the day in South Africa (the business's time zone). */
function saNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
const minutesOf = (time) => {
  const t = normalizeTime(time);
  return t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null;
};

/**
 * Can this booking be marked Missed yet? Only once its time has passed by a grace period: a booking
 * with a time on an earlier day, or today more than MISSED_GRACE_MINUTES after it started. A booking
 * without a time can be marked missed from that day on (the owner knows whether the customer came).
 * Nothing is ever marked missed automatically.
 */
function canMarkMissed(work, now = new Date()) {
  const { date, minutes } = saNow(now);
  if (!work?.date) return false;
  if (work.date < date) return true;
  if (work.date > date) return false;
  const start = minutesOf(work.time);
  return start === null ? true : minutes >= start + MISSED_GRACE_MINUTES();
}

const slot = (w) => `${w.date || ''}${w.time ? ` ${w.time}` : ''}`.trim();

/** Another open (or completed) booking for the same customer at the same date and time / same service that day. */
async function findDuplicate(businessId, w, excludeId) {
  if (!w.customer_id || !w.date) return null;
  const rows = ok(await supabase.from('upcoming_work').select('*').eq('business_id', businessId).eq('date', w.date));
  const norm = (s) => String(s || '').trim().toLowerCase();
  return (
    (rows || []).find(
      (r) =>
        r.id !== excludeId &&
        r.customer_id === w.customer_id &&
        ['Pending', 'Confirmed', 'Completed'].includes(r.status) &&
        // both have a time: same time is a duplicate; otherwise the same service that day is
        (w.time && r.time ? r.time === w.time : norm(r.service || r.title) === norm(w.service || w.title))
    ) || null
  );
}

async function checkCustomer(businessId, customerId) {
  if (!customerId) return null;
  if (!isUuid(customerId)) throw badRequest('That customer does not exist.');
  const found = ok(await supabase.from('customers').select('id').eq('id', customerId).eq('business_id', businessId).maybeSingle());
  if (!found) throw badRequest('That customer does not exist. They may have been deleted: pick another customer.');
  return customerId;
}

function readDate(value, { required }) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest('Pick a date for the booking.');
    return undefined;
  }
  if (!isIsoDate(value)) throw badRequest('Date must be a real calendar date written YYYY-MM-DD.');
  return value;
}
// Reminder codes (same rules as the app, src/lib/reminders.js): 'd0'..'d60', 'h1'..'h72', at most 5.
const DEFAULT_REMINDERS = ['d1'];
function readReminders(value) {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value)) throw badRequest('Reminders must be a list, e.g. ["d1", "d0"].');
  const ok = [];
  for (const raw of value) {
    const m = /^([dh])(\d{1,2})$/.exec(String(raw).trim());
    const n = m ? Number(m[2]) : -1;
    if (!m || (m[1] === 'd' && n > 60) || (m[1] === 'h' && (n < 1 || n > 72))) {
      throw badRequest('A reminder can be on the day, 1 to 60 days before, or 1 to 72 hours before.');
    }
    if (!ok.includes(`${m[1]}${n}`)) ok.push(`${m[1]}${n}`);
  }
  if (ok.length > 5) throw badRequest('Choose at most 5 reminders for one booking.');
  return ok;
}

function readPrice(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = parseNumber(value);
  if (n === null || n < 0) throw badRequest('Price must be a number of 0 or more.');
  return Math.round(n * 100) / 100;
}
function readTime(value) {
  if (value === undefined) return undefined;
  const t = normalizeTime(value);
  if (t === null) throw badRequest('Time should look like 14:30 or 2pm.');
  return t || null;
}

// Columns added for booking history. A database where backend/supabase/schema.sql has not been run again
// yet doesn't have them; writes then quietly leave them out (everything else keeps working).
const EXTRA = ['completed_at', 'status_changed_at', 'rescheduled_from', 'reschedule_count', 'notes', 'price', 'reminders'];
let extraColumns = true;
const missingColumn = (e) => e && (e.code === 'PGRST204' || e.code === '42703' || /column .* (does not exist|of 'upcoming_work')/i.test(e.message || ''));
async function write(run, fields) {
  const attempt = async (f) => run(f);
  let res = await attempt(extraColumns ? fields : strip(fields));
  if (res.error && extraColumns && missingColumn(res.error)) {
    extraColumns = false;
    console.warn('[bookings] booking history columns are missing: run backend/supabase/schema.sql again to keep completion / reschedule details.');
    res = await attempt(strip(fields));
  }
  return ok(res);
}
const strip = (f) => Object.fromEntries(Object.entries(f).filter(([k]) => !EXTRA.includes(k)));

/**
 * Creates a booking.
 *   input: { title, service, customerId, date, time, status, notes }
 *   opts:  { requireCustomer, now }
 * New bookings are Scheduled / Confirmed for today or later, or Completed for today or earlier
 * (logging a visit that already happened). They can't be created as Missed or Cancelled.
 */
async function createBooking(businessId, input = {}, { requireCustomer = false, now = new Date() } = {}) {
  const title = cleanText(input.title, 160) || '';
  const service = cleanText(input.service, 120) || '';
  if (!title && !service) throw badRequest('Give the booking a title or pick a service.');
  const date = readDate(input.date, { required: true });
  const time = readTime(input.time) ?? null;
  const status = input.status ? normalizeStatus(input.status) : 'Pending';
  if (!status) throw badRequest(`Status must be one of: Scheduled, Confirmed, Completed.`);
  if (status === 'No-show' || status === 'Cancelled') throw badRequest('A new booking can only be Scheduled, Confirmed or Completed.');
  const today = saNow(now).date;
  if (OPEN.includes(status) && date < today) throw badRequest('That date has passed. Pick today or a later date, or record it as a completed visit.');
  if (status === 'Completed' && date > today) throw badRequest('A visit on a future date cannot be completed yet.');

  const customerId = input.customerId ?? input.customer_id ?? null;
  if (requireCustomer && !customerId) throw badRequest('Choose the customer this booking is for.');
  await checkCustomer(businessId, customerId);

  const row = {
    business_id: businessId,
    title: title || service,
    service: service || null,
    customer_id: customerId || null,
    date,
    time,
    status,
    completed_at: status === 'Completed' ? now.toISOString() : null,
    status_changed_at: now.toISOString(),
    reschedule_count: 0,
    notes: cleanText(input.notes, 500) || null,
    reminders: readReminders(input.reminders) ?? DEFAULT_REMINDERS,
  };
  // The agreed price: what was entered, else the service's current price.
  const price = readPrice(input.price);
  row.price = price !== undefined && price !== null ? price : (await bookingPrice(businessId, row)) || null;
  const dup = await findDuplicate(businessId, row, null);
  if (dup) throw new HttpError(409, `This customer is already booked for ${slot(dup)} (${dup.title || dup.service}).`);

  let created;
  try {
    created = await write((f) => supabase.from('upcoming_work').insert(f).select().single(), row);
  } catch (e) {
    if (e.status === 409) throw new HttpError(409, 'This customer is already booked at that time.');
    throw e;
  }
  if (status !== 'Completed') return created;
  // Logged as an already-completed visit: record its income too, or undo the booking if that fails.
  try {
    return { ...created, income: await ensureIncome(businessId, created) };
  } catch (e) {
    await supabase.from('upcoming_work').delete().eq('id', created.id).eq('business_id', businessId);
    throw new HttpError(502, "Couldn't record the income for this visit, so it was not saved. Please try again.");
  }
}

/**
 * Changes a booking: details, status, or a move to another date / time.
 *  - Completed is only possible on or after the booking's day, and completing an already completed
 *    booking changes nothing (the visit is counted once; completed_at keeps the first time).
 *  - Missed is only possible once the booking's time has passed (see canMarkMissed).
 *  - A completed visit can't be cancelled; undo the completion first (status back to Scheduled).
 *  - Moving an unfinished, missed or cancelled booking to a new date / time is a reschedule: it must be
 *    today or later, it becomes Scheduled again (unless a status is given) and remembers where it was.
 *  - Changing the date of a completed visit is a correction (today or earlier), not a reschedule.
 */
async function updateBooking(businessId, id, input = {}, { now = new Date() } = {}) {
  const existing = ok(await supabase.from('upcoming_work').select('*').eq('id', id).eq('business_id', businessId).maybeSingle());
  if (!existing) throw notFound('Booking not found.');
  const today = saNow(now).date;
  const f = {};

  if (input.title !== undefined) f.title = cleanText(input.title, 160) || null;
  if (input.service !== undefined) f.service = cleanText(input.service, 120) || null;
  if (input.notes !== undefined) f.notes = cleanText(input.notes, 500) || null;
  // Changing the agreed price never changes income already recorded (that is edited in Transactions).
  const price = readPrice(input.price);
  if (price !== undefined) f.price = price;
  const reminders = readReminders(input.reminders);
  if (reminders !== undefined) f.reminders = reminders;
  if (input.customerId !== undefined || input.customer_id !== undefined) {
    const c = input.customerId ?? input.customer_id;
    f.customer_id = (await checkCustomer(businessId, c || null)) || null;
  }
  const date = readDate(input.date, { required: false });
  const time = readTime(input.time);
  if (input.date === null || input.date === '') throw badRequest('A booking needs a date.');
  if (date !== undefined) f.date = date;
  if (time !== undefined) f.time = time;

  let status = existing.status;
  if (input.status !== undefined && input.status !== null && input.status !== '') {
    status = normalizeStatus(input.status);
    if (!status) throw badRequest('Status must be one of: Scheduled, Confirmed, Completed, Missed, Cancelled.');
  }

  const merged = { ...existing, ...f, status };
  if (!merged.title && !merged.service) throw badRequest('Give the booking a title or pick a service.');
  const moved = (f.date !== undefined && f.date !== existing.date) || (f.time !== undefined && (f.time || null) !== (existing.time || null));

  if (moved) {
    if (existing.status === 'Completed' && status === 'Completed') {
      if (merged.date > today) throw badRequest('A completed visit cannot be moved to a future date.');
    } else {
      if (merged.date < today) throw badRequest('Pick today or a later date to reschedule.');
      // Rescheduling a missed or cancelled booking brings it back as Scheduled.
      if (input.status === undefined || input.status === null || input.status === '') {
        if (!OPEN.includes(existing.status)) status = 'Pending';
      }
      if (status === 'Completed' || status === 'No-show' || status === 'Cancelled') {
        throw badRequest('Move the booking first, then set its outcome on the day.');
      }
      f.rescheduled_from = slot(existing);
      f.reschedule_count = Number(existing.reschedule_count || 0) + 1;
      merged.status = status;
    }
  }

  if (status !== existing.status) {
    if (status === 'Completed' && merged.date > today) throw badRequest('This booking is on a future date. Change the date first, or complete it on the day.');
    if (status === 'No-show' && !canMarkMissed(merged, now)) throw badRequest("This appointment's time hasn't passed yet, so it can't be marked as missed.");
    if (status === 'Cancelled' && existing.status === 'Completed') throw badRequest('A completed visit cannot be cancelled. Undo the completion first if it did not happen.');
    f.status = status;
    f.status_changed_at = now.toISOString();
    if (status === 'Completed') f.completed_at = now.toISOString();
    if (existing.status === 'Completed') f.completed_at = null;
  } else if (status === 'Completed' && !existing.completed_at) {
    // An older completed booking without a completion time keeps working; nothing to change.
  }

  if (!Object.keys(f).length) return existing; // e.g. "complete" pressed twice: nothing changes

  const completing = f.status === 'Completed' && existing.status !== 'Completed';
  const uncompleting = existing.status === 'Completed' && f.status !== undefined && f.status !== 'Completed';

  if (['Pending', 'Confirmed', 'Completed'].includes(merged.status)) {
    const dup = await findDuplicate(businessId, { ...merged, ...f }, existing.id);
    if (dup) throw new HttpError(409, `This customer is already booked for ${slot(dup)} (${dup.title || dup.service}).`);
  }

  // Completing: record the income FIRST. If that fails the booking is left exactly as it was, so a booking
  // is never "Completed" without its income (and the income is never recorded for an unfinished booking).
  let income = null;
  if (completing) {
    try {
      income = await ensureIncome(businessId, { ...existing, ...f });
    } catch (e) {
      console.error('[bookings] income could not be recorded:', e.message);
      throw new HttpError(502, "Couldn't record the income for this booking, so it was not marked completed. Please try again.");
    }
  }

  let data;
  try {
    data = await write(
      (fields) => supabase.from('upcoming_work').update(fields).eq('id', id).eq('business_id', businessId).select().maybeSingle(),
      f
    );
    if (!data) throw notFound('Booking not found.');
  } catch (e) {
    // The booking change failed: take back income that was created for it just now.
    if (income?.created) await supabase.from('transactions').delete().eq('id', income.transaction.id).eq('business_id', businessId);
    throw e;
  }

  if (uncompleting) {
    try {
      income = { removed: await removeIncome(businessId, id) };
    } catch (e) {
      console.error('[bookings] automatic income could not be removed:', e.message);
      income = { removed: [], removeFailed: true };
    }
  }
  return income ? { ...data, income } : data;
}

module.exports = { STATUSES, OPEN, normalizeStatus, normalizeTime, saNow, canMarkMissed, createBooking, updateBooking, findDuplicate, MISSED_GRACE_MINUTES };
