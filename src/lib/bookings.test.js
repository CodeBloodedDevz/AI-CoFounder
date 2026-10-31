import { bookingState, canMarkMissed, canComplete, customerHistory, splitBookings, findDuplicateBooking, formStatusOptions, needsOutcome } from './bookings';

// Wednesday 14 October 2026, 11:00 local time.
const NOW = new Date(2026, 9, 14, 11, 0, 0);
const at = (h, m = 0) => new Date(2026, 9, 14, h, m, 0);
const services = [{ name: 'Haircut', price: 80, duration: '45 minutes' }, { name: 'Colour', price: 300, duration: '2 hours' }];
const w = (id, extra) => ({ id, title: 'Haircut', service: 'Haircut', customerId: 'c1', date: '2026-10-20', time: '10:00', status: 'Pending', ...extra });

describe('booking states', () => {
  test('a new future booking is scheduled, not a visit', () => {
    expect(bookingState(w('a'), NOW, services)).toBe('scheduled');
    expect(bookingState(w('a', { status: 'Confirmed' }), NOW, services)).toBe('confirmed');
    expect(customerHistory('c1', [w('a')], { now: NOW, services }).visits).toBe(0);
  });
  test('missed is allowed only 15 minutes after the start, and never automatic', () => {
    const today = w('t', { date: '2026-10-14', time: '10:50' });
    expect(canMarkMissed(today, NOW)).toBe(false);
    expect(canMarkMissed(today, at(11, 5))).toBe(true);
    expect(bookingState(today, at(11, 5), services)).toBe('scheduled'); // still not missed by itself
    expect(canMarkMissed(w('f'), NOW)).toBe(false); // future
    expect(canMarkMissed(w('c', { status: 'Completed', date: '2026-10-01' }), NOW)).toBe(false);
  });
  test('an unfinished booking whose time is over needs an outcome (duration + grace)', () => {
    const colour = w('c', { date: '2026-10-14', time: '08:00', service: 'Colour' }); // 2h -> ends 10:00, +30 = 10:30
    expect(needsOutcome(colour, at(10, 20), services)).toBe(false);
    expect(needsOutcome(colour, at(10, 31), services)).toBe(true);
    expect(bookingState(w('y', { date: '2026-10-13' }), NOW, services)).toBe('awaiting'); // passed while the app was closed
    expect(needsOutcome(w('d', { date: '2026-10-14', time: '' }), NOW, services)).toBe(false); // all-day: still today
  });
  test('completing is possible on or after the day only', () => {
    expect(canComplete(w('f'), NOW)).toBe(false);
    expect(canComplete(w('t', { date: '2026-10-14' }), NOW)).toBe(true);
    expect(canComplete(w('x', { date: '2026-10-10', status: 'Cancelled' }), NOW)).toBe(false);
  });
});

describe('customer history', () => {
  const list = [
    w('1', { date: '2026-09-01', status: 'Completed' }),
    w('2', { date: '2026-09-20', status: 'Completed', service: 'Colour' }),
    w('3', { date: '2026-10-01', status: 'No-show' }),
    w('4', { date: '2026-10-05', status: 'Cancelled' }),
    w('5', { date: '2026-10-13', status: 'Pending' }),
    w('6', { date: '2026-10-20', status: 'Confirmed' }),
    w('7', { date: '2026-11-02', status: 'Pending' }),
    w('8', { customerId: 'other', status: 'Completed', date: '2026-09-02' }),
  ];
  test('counts completed visits only, from the records', () => {
    const h = customerHistory('c1', list, { now: NOW, services });
    expect(h).toMatchObject({ visits: 2, upcoming: 2, awaiting: 1, missed: 1, cancelled: 1, total: 7, spent: 380 });
    expect(h.lastVisit.id).toBe('2');
    expect(h.nextBooking.id).toBe('6');
    expect(h.items[0].id).toBe('7');
  });
  test('the example: 0 visits while scheduled, 1 after completing, 2 after another', () => {
    let rows = [w('a', { date: '2026-10-14' })];
    expect(customerHistory('c1', rows, { now: NOW }).visits).toBe(0);
    rows = [{ ...rows[0], status: 'Completed' }];
    expect(customerHistory('c1', rows, { now: NOW }).visits).toBe(1);
    rows = [...rows, { ...rows[0], status: 'Completed' }]; // the same record seen twice (e.g. a refresh)
    expect(customerHistory('c1', [rows[0]], { now: NOW }).visits).toBe(1);
    rows = [rows[0], w('b', { date: '2026-10-14', time: '09:00', status: 'Completed' })];
    expect(customerHistory('c1', rows, { now: NOW }).visits).toBe(2);
  });
  test('missed and cancelled never count; a corrected booking updates the summary', () => {
    const rows = [w('m', { date: '2026-10-10', status: 'No-show' }), w('c', { date: '2026-10-11', status: 'Cancelled' })];
    expect(customerHistory('c1', rows, { now: NOW }).visits).toBe(0);
    const fixed = [{ ...rows[0], status: 'Completed' }, rows[1]];
    expect(customerHistory('c1', fixed, { now: NOW })).toMatchObject({ visits: 1, missed: 0, cancelled: 1 });
  });
});

describe('lists and validation', () => {
  test('splitBookings separates needs-outcome, upcoming and history', () => {
    const s = splitBookings([w('u'), w('a', { date: '2026-10-12' }), w('d', { status: 'Completed', date: '2026-10-01' }), w('x', { status: 'Cancelled' })], NOW, services);
    expect(s.needsOutcome.map((x) => x.id)).toEqual(['a']);
    expect(s.upcoming.map((x) => x.id)).toEqual(['u']);
    expect(s.history.map((x) => x.id)).toEqual(['x', 'd']);
  });
  test('duplicates: same customer and time, or same service on a day without times', () => {
    const rows = [w('a'), w('b', { status: 'Cancelled', date: '2026-10-21' })];
    expect(findDuplicateBooking(rows, { customerId: 'c1', date: '2026-10-20', time: '10:00' })?.id).toBe('a');
    expect(findDuplicateBooking(rows, { customerId: 'c1', date: '2026-10-20', time: '10:00' }, 'a')).toBeNull(); // editing itself
    expect(findDuplicateBooking(rows, { customerId: 'c1', date: '2026-10-21', time: '10:00' })).toBeNull(); // cancelled slot is free
    expect(findDuplicateBooking(rows, { customerId: 'c2', date: '2026-10-20', time: '10:00' })).toBeNull();
    expect(findDuplicateBooking(rows, { customerId: 'c1', date: '2026-10-20', time: '', service: 'Haircut' })?.id).toBe('a');
  });
  test('form status choices follow the date', () => {
    expect(formStatusOptions('2026-10-20', NOW)).toEqual(['Pending', 'Confirmed']);
    expect(formStatusOptions('2026-10-14', NOW)).toEqual(['Pending', 'Confirmed', 'Completed']);
    expect(formStatusOptions('2026-10-01', NOW)).toEqual(['Completed']);
  });
});
