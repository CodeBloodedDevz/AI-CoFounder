import { parseReminder, normalizeReminders, reminderTime, plannedReminders, reminderStatus, MAX_SCHEDULED } from './reminders';

const t = (key, p = {}) => `${key}${Object.keys(p).length ? JSON.stringify(p) : ''}`;
const NOW = new Date(2026, 9, 14, 11, 0); // Wed 14 Oct 2026 11:00 local
const w = (extra) => ({ id: 'b1', title: 'Haircut', service: 'Haircut', customerId: 'c1', date: '2026-10-20', time: '10:00', status: 'Pending', reminders: ['d1'], ...extra });
const customers = [{ id: 'c1', name: 'Lerato' }];

describe('reminder codes', () => {
  test('valid codes, invalid ones dropped, earliest first, no repeats', () => {
    expect(parseReminder('d3')).toEqual({ kind: 'day', n: 3 });
    expect(parseReminder('h2')).toEqual({ kind: 'hour', n: 2 });
    expect(parseReminder('h0')).toBeNull();
    expect(parseReminder('d61')).toBeNull();
    expect(parseReminder('x1')).toBeNull();
    expect(normalizeReminders(['d1', 'd3', 'h2', 'd1', 'bad', 'd0'])).toEqual(['d3', 'd1', 'd0', 'h2']);
    expect(normalizeReminders(null)).toEqual([]);
  });
});

describe('when reminders fire (local time)', () => {
  test('days before at 08:00, hours before the start, on the day before an early start', () => {
    expect(reminderTime(w(), 'd1')).toEqual(new Date(2026, 9, 19, 8, 0));
    expect(reminderTime(w(), 'd3')).toEqual(new Date(2026, 9, 17, 8, 0));
    expect(reminderTime(w(), 'h2')).toEqual(new Date(2026, 9, 20, 8, 0));
    expect(reminderTime(w(), 'd0')).toEqual(new Date(2026, 9, 20, 8, 0));
    expect(reminderTime(w({ time: '08:30' }), 'd0')).toEqual(new Date(2026, 9, 20, 7, 30)); // an hour before instead
    expect(reminderTime(w({ date: '2026-11-01' }), 'd1')).toEqual(new Date(2026, 9, 31, 8, 0)); // across a month end
    expect(reminderTime(w({ time: '' }), 'h1')).toEqual(new Date(2026, 9, 20, 7, 0)); // no time: counts from 08:00
  });
});

describe('planned reminders', () => {
  test('several reminders for one booking, with customer, service, date and business', () => {
    const list = plannedReminders([w({ reminders: ['d3', 'd1'] })], { customers, businessName: 'Thando Spaza', now: NOW, t, formatWhen: () => 'Tue 20 Oct at 10:00' });
    expect(list.map((r) => r.code)).toEqual(['d3', 'd1']);
    expect(list[1].title).toBe('reminders.notifTitleTomorrow{"what":"Haircut"}');
    expect(list[1].body).toContain('Lerato');
    expect(list[1].body).toContain('Tue 20 Oct at 10:00');
    expect(list[1].body).toContain('Thando Spaza');
    expect(list[0].data).toEqual({ type: 'appointment-reminder', bookingId: 'b1' });
    expect(new Set(list.map((r) => r.id)).size).toBe(2);
  });
  test('nothing for completed, cancelled, missed, reminders off, or times already passed', () => {
    const none = (x) => plannedReminders([w(x)], { customers, now: NOW, t });
    expect(none({ status: 'Completed' })).toEqual([]);
    expect(none({ status: 'Cancelled' })).toEqual([]);
    expect(none({ status: 'No-show' })).toEqual([]);
    expect(none({ reminders: [] })).toEqual([]);
    expect(none({ reminders: null })).toEqual([]);
    expect(none({ date: '2026-10-15', reminders: ['d3'] })).toEqual([]); // 3 days before was in the past
    expect(none({ date: '2026-10-15', reminders: ['d3', 'd1'] })).toEqual([]); // d1 = today 08:00, also past
    expect(plannedReminders([w({ date: '2026-10-15', reminders: ['d0'] })], { now: NOW, t }).length).toBe(1);
  });
  test('moving the appointment or changing details changes the reminder id (so it is rescheduled)', () => {
    const a = plannedReminders([w()], { customers, now: NOW, t })[0].id;
    // Same 08:00 firing time, but the text shows the new appointment time, so it is rescheduled too.
    expect(plannedReminders([w({ time: '11:00' })], { customers, now: NOW, t })[0].id).not.toBe(a);
    expect(plannedReminders([w({ date: '2026-10-21' })], { customers, now: NOW, t })[0].id).not.toBe(a);
    expect(plannedReminders([w()], { customers: [{ id: 'c1', name: 'Lerato M' }], now: NOW, t })[0].id).not.toBe(a);
  });
  test('soonest first and capped for the phone', () => {
    const many = Array.from({ length: 40 }, (_, i) => w({ id: `b${i}`, date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`, reminders: ['d1', 'd2'] }));
    const list = plannedReminders(many, { now: NOW, t });
    expect(list.length).toBe(MAX_SCHEDULED);
    expect(list.every((r, i) => i === 0 || list[i - 1].fireAt <= r.fireAt)).toBe(true);
  });
});

describe('reminder status', () => {
  test('scheduled, off, passed, not needed', () => {
    expect(reminderStatus(w(), NOW).state).toBe('scheduled');
    expect(reminderStatus(w(), NOW).next).toEqual(new Date(2026, 9, 19, 8, 0));
    expect(reminderStatus(w({ reminders: [] }), NOW).state).toBe('off');
    expect(reminderStatus(w({ date: '2026-10-15', reminders: ['d3'] }), NOW).state).toBe('passed');
    expect(reminderStatus(w({ status: 'Completed' }), NOW).state).toBe('notNeeded');
  });
});
