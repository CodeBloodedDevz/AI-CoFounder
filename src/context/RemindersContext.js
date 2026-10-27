import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useApp } from './AppContext';
import { useTranslation } from '../i18n/I18nContext';
import { plannedReminders } from '../lib/reminders';
import { notificationsSupported, reminderScheduler } from '../lib/notifications';
import { navigationRef } from '../navigation/navigationRef';

// Keeps the phone's scheduled appointment reminders in step with the bookings, and knows whether this device
// may show notifications. Re-syncs when bookings / customers / business change, and whenever the app comes
// back to the foreground (so changes made elsewhere, a new day or a new time zone are picked up).
const RemindersContext = createContext({ supported: false, permission: 'unsupported', canAskAgain: false, requestPermission: async () => ({}), refreshPermission: async () => {} });

export function RemindersProvider({ children }) {
  const { state, isReady, dataStatus } = useApp();
  const { t, formatDate, language } = useTranslation();
  const [permission, setPermission] = useState(notificationsSupported ? 'undetermined' : 'unsupported');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [tick, setTick] = useState(0); // bumps on returning to the app
  const loggedIn = Boolean(state.user);

  const refreshPermission = useCallback(async () => {
    if (!notificationsSupported) return;
    try {
      const p = await reminderScheduler.permission();
      setPermission(p.status);
      setCanAskAgain(p.canAskAgain);
    } catch (e) {
      console.warn('[reminders] permission check failed:', e?.message);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!notificationsSupported) return { status: 'unsupported' };
    try {
      const p = await reminderScheduler.requestPermission();
      setPermission(p.status);
      setCanAskAgain(p.canAskAgain);
      return p;
    } catch (e) {
      return { status: 'denied', error: e?.message };
    }
  }, []);

  useEffect(() => {
    if (!notificationsSupported) return undefined;
    reminderScheduler.setup({ channelName: t('reminders.channelName') }).catch(() => {});
    refreshPermission();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        refreshPermission(); // notifications may have been turned on / off in Settings
        setTick((n) => n + 1);
      }
    });
    return () => sub.remove();
  }, [refreshPermission]); // eslint-disable-line react-hooks/exhaustive-deps

  // Schedule / cancel to match the bookings (debounced: several changes in a row sync once).
  const timer = useRef(null);
  useEffect(() => {
    if (!notificationsSupported) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        if (!isReady) return; // still finding out who is logged in
        if (!loggedIn) {
          await reminderScheduler.cancelAll(); // nobody's reminders on a logged-out phone
          return;
        }
        // Only once the bookings have loaded: an empty list while loading must not cancel everything.
        if (permission !== 'granted' || dataStatus !== 'ready') return;
        const planned = plannedReminders(state.upcomingWork, {
          customers: state.customers,
          businessName: state.business?.name || '',
          t,
          formatWhen: (w) =>
            `${formatDate(w.date, { weekday: 'short', day: 'numeric', month: 'short' })}${w.time ? ` ${t('schedule.atTime', { time: w.time })}` : ''}`,
        });
        const out = await reminderScheduler.sync(planned);
        if (out.scheduled || out.cancelled || out.failed) console.log('[reminders] synced', out);
      } catch (e) {
        console.warn('[reminders] sync failed:', e?.message);
      }
    }, 400);
    return () => clearTimeout(timer.current);
  }, [isReady, dataStatus, loggedIn, permission, state.upcomingWork, state.customers, state.business?.name, language, tick, t, formatDate]);

  // Tapping a reminder opens Manage bookings on that booking (also when the tap started the app).
  useEffect(() => {
    if (!notificationsSupported) return undefined;
    let tries = 0;
    let pendingTimer = null;
    const open = (bookingId) => {
      if (navigationRef.isReady() && loggedIn) {
        navigationRef.navigate('Operations', { view: 'work', bookingId, openedAt: Date.now() });
      } else if (tries++ < 40) {
        pendingTimer = setTimeout(() => open(bookingId), 250); // the app is still starting
      }
    };
    const unsubscribe = reminderScheduler.onReminderTapped(open);
    return () => {
      unsubscribe();
      clearTimeout(pendingTimer);
    };
  }, [loggedIn]);

  const value = useMemo(
    () => ({ supported: notificationsSupported, permission, canAskAgain, requestPermission, refreshPermission }),
    [permission, canAskAgain, requestPermission, refreshPermission]
  );
  return <RemindersContext.Provider value={value}>{children}</RemindersContext.Provider>;
}

export const useReminders = () => useContext(RemindersContext);
