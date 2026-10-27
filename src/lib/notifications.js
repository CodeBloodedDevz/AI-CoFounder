// Delivers appointment reminders through the phone's own notification system (expo-notifications).
//
// Reminders are LOCAL scheduled notifications: the app hands each one to iOS / Android with its exact time, and
// the operating system shows it in the notification centre at that time, whether or not the app is open or
// running. No server, push token or background task is involved, which is also why this works in Expo Go
// (Expo Go no longer supports *remote* push notifications on Android; local ones are fine).
//
// The phone only knows what this app scheduled on it, so the app re-syncs whenever bookings change and when it
// is opened: every booking change (made here, on the web, on another phone or by the AI assistant) is
// reflected the next time the app runs on this phone. See plannedReminders() in reminders.js for the rules.

import { Platform } from 'react-native';
import * as ExpoNotifications from 'expo-notifications';

export const CHANNEL_ID = 'appointments';
const PREFIX = 'appt-';

export const notificationsSupported = Platform.OS !== 'web';

/**
 * The scheduler, built around the expo-notifications module (passed in so it can be tested with a fake).
 */
export function createReminderScheduler(N = ExpoNotifications, { os = Platform.OS } = {}) {
  let configured = false;

  async function setup({ channelName = 'Appointment reminders' } = {}) {
    if (configured || os === 'web') return;
    configured = true;
    // Show reminders even when the app happens to be open (as a banner), like any other notification.
    N.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    if (os === 'android') {
      await N.setNotificationChannelAsync(CHANNEL_ID, {
        name: channelName,
        importance: N.AndroidImportance?.HIGH ?? 4,
        sound: 'default',
        vibrationPattern: [0, 250, 150, 250],
      });
    }
  }

  /** 'granted' | 'denied' | 'undetermined' (+ canAskAgain). Web: 'unsupported'. */
  async function permission() {
    if (os === 'web') return { status: 'unsupported', canAskAgain: false };
    const p = await N.getPermissionsAsync();
    const granted = p.granted || p.ios?.status === 2 || p.status === 'granted';
    return { status: granted ? 'granted' : p.status === 'denied' ? 'denied' : 'undetermined', canAskAgain: p.canAskAgain !== false };
  }

  async function requestPermission() {
    if (os === 'web') return { status: 'unsupported', canAskAgain: false };
    await setup();
    const p = await N.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    const granted = p.granted || p.status === 'granted';
    return { status: granted ? 'granted' : 'denied', canAskAgain: p.canAskAgain !== false };
  }

  /**
   * Makes the phone's pending reminders match `planned` exactly: cancels ours that are no longer wanted
   * (booking deleted, cancelled, completed, moved, reminder turned off) and schedules the missing ones.
   * Other apps' / other features' notifications are never touched (only identifiers starting "appt-").
   * -> { scheduled, cancelled, kept, failed }
   */
  async function sync(planned) {
    if (os === 'web') return { scheduled: 0, cancelled: 0, kept: 0, failed: 0 };
    await setup();
    const pending = (await N.getAllScheduledNotificationsAsync()) || [];
    const ours = pending.map((n) => n.identifier).filter((id) => typeof id === 'string' && id.startsWith(PREFIX));
    const wanted = new Map(planned.map((r) => [r.id, r]));
    let cancelled = 0;
    let scheduled = 0;
    let failed = 0;
    for (const id of ours) {
      if (!wanted.has(id)) {
        await N.cancelScheduledNotificationAsync(id);
        cancelled += 1;
      }
    }
    const have = new Set(ours);
    for (const r of planned) {
      if (have.has(r.id)) continue;
      try {
        await N.scheduleNotificationAsync({
          identifier: r.id,
          content: { title: r.title, body: r.body, data: r.data, sound: 'default' },
          trigger: { type: N.SchedulableTriggerInputTypes?.DATE ?? 'date', date: r.fireAt, channelId: CHANNEL_ID },
        });
        scheduled += 1;
      } catch (e) {
        failed += 1;
        console.warn('[reminders] could not schedule a reminder:', e?.message);
      }
    }
    return { scheduled, cancelled, kept: planned.length - scheduled - failed, failed };
  }

  /** Removes every pending appointment reminder from this phone (e.g. when logging out). */
  async function cancelAll() {
    if (os === 'web') return 0;
    const pending = (await N.getAllScheduledNotificationsAsync()) || [];
    const ours = pending.map((n) => n.identifier).filter((id) => typeof id === 'string' && id.startsWith(PREFIX));
    for (const id of ours) await N.cancelScheduledNotificationAsync(id);
    return ours.length;
  }

  /** Calls onOpen(bookingId) when a reminder is tapped, including the tap that started the app. */
  function onReminderTapped(onOpen) {
    if (os === 'web') return () => {};
    const handled = new Set();
    const handle = (response) => {
      const req = response?.notification?.request;
      const data = req?.content?.data;
      if (!data || data.type !== 'appointment-reminder' || handled.has(req.identifier)) return;
      handled.add(req.identifier);
      onOpen(data.bookingId);
    };
    const sub = N.addNotificationResponseReceivedListener(handle);
    N.getLastNotificationResponseAsync?.().then(handle).catch(() => {});
    return () => sub?.remove?.();
  }

  return { setup, permission, requestPermission, sync, cancelAll, onReminderTapped };
}

export const reminderScheduler = createReminderScheduler();
