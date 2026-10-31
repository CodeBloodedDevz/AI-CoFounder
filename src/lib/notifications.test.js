import { createReminderScheduler } from './notifications';

// A pretend notification system: remembers what is scheduled, like the phone would.
function fakeNotifications() {
  const pending = new Map();
  return {
    pending,
    setNotificationHandler() {},
    setNotificationChannelAsync: async () => {},
    AndroidImportance: { HIGH: 4 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    getPermissionsAsync: async () => ({ granted: true, status: 'granted', canAskAgain: true }),
    requestPermissionsAsync: async () => ({ granted: true, status: 'granted' }),
    getAllScheduledNotificationsAsync: async () => [...pending.values()],
    cancelScheduledNotificationAsync: async (id) => pending.delete(id),
    scheduleNotificationAsync: async (req) => {
      pending.set(req.identifier, req);
      return req.identifier;
    },
    addNotificationResponseReceivedListener: () => ({ remove() {} }),
    getLastNotificationResponseAsync: async () => null,
  };
}
const r = (id, at = new Date(2030, 0, 1, 8)) => ({ id, fireAt: at, title: 'T', body: 'B', data: { type: 'appointment-reminder', bookingId: id.split('-')[1] } });

describe('reminder scheduler', () => {
  test('schedules what is planned and leaves other notifications alone', async () => {
    const N = fakeNotifications();
    N.pending.set('other-app-thing', { identifier: 'other-app-thing' });
    const s = createReminderScheduler(N, { os: 'android' });
    const out = await s.sync([r('appt-b1-d3-x'), r('appt-b1-d1-x')]);
    expect(out).toEqual({ scheduled: 2, cancelled: 0, kept: 0, failed: 0 });
    expect([...N.pending.keys()].sort()).toEqual(['appt-b1-d1-x', 'appt-b1-d3-x', 'other-app-thing']);
    expect(N.pending.get('appt-b1-d1-x').trigger).toMatchObject({ type: 'date', channelId: 'appointments' });
  });
  test('syncing again changes nothing (no duplicates); edits replace, cancels remove', async () => {
    const N = fakeNotifications();
    const s = createReminderScheduler(N, { os: 'ios' });
    await s.sync([r('appt-b1-d1-a'), r('appt-b2-d1-a')]);
    expect(await s.sync([r('appt-b1-d1-a'), r('appt-b2-d1-a')])).toEqual({ scheduled: 0, cancelled: 0, kept: 2, failed: 0 });
    // b1 moved (new id), b2 cancelled / completed / deleted (no longer planned)
    const out = await s.sync([r('appt-b1-d1-b')]);
    expect(out).toEqual({ scheduled: 1, cancelled: 2, kept: 0, failed: 0 });
    expect([...N.pending.keys()]).toEqual(['appt-b1-d1-b']);
  });
  test('logging out removes every appointment reminder', async () => {
    const N = fakeNotifications();
    N.pending.set('other', { identifier: 'other' });
    const s = createReminderScheduler(N, { os: 'android' });
    await s.sync([r('appt-b1-d1-a')]);
    expect(await s.cancelAll()).toBe(1);
    expect([...N.pending.keys()]).toEqual(['other']);
  });
  test('the web has no scheduled notifications', async () => {
    const s = createReminderScheduler(fakeNotifications(), { os: 'web' });
    expect((await s.permission()).status).toBe('unsupported');
    expect(await s.sync([r('appt-b1-d1-a')])).toEqual({ scheduled: 0, cancelled: 0, kept: 0, failed: 0 });
  });
});
