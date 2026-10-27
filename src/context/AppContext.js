import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { createApiClient } from '../lib/apiClient';
import { readRecording, RecordingError } from '../lib/audioUpload';
import { supabase, API_URL, API_URL_SOURCE } from '../supabaseClient';
import { tr, getLanguage } from '../i18n/current';
import { normalizeCurrency } from '../lib/businessForm';
import { resolveLanguage } from '../i18n/languages';

const AppContext = createContext(null);

const STORAGE_KEY = 'ai-cofounder-state-v1';
const PENDING_KEY = 'ai-cofounder-pending-verification-v1';
const PENDING_PAYMENT_KEY = 'ai-cofounder-pending-payment-v1';
const PENDING_PAYMENT_MAX_AGE_MS = 3 * 60 * 60_000;

export const MIN_PASSWORD_LENGTH = 6;

// The plan is decided by the SERVER: it is only ever changed after Paystack has confirmed a payment.
// This is just what the app shows until the server has answered (and what Free looks like).
export const DEFAULT_SUBSCRIPTION = {
  plan: 'Free',
  planId: 'free',
  billingCycle: null,
  status: 'free',
  paymentMethod: null,
  startedOn: null,
  renewsOn: null,
  cancelAtPeriodEnd: false,
  entitlements: { aiMessagesPerDay: 20, pricingAssistant: false, restockPlan: false, retentionInsights: false, growthInsights: false, multiBusiness: false },
};
const DEFAULT_PAYMENTS = { enabled: false, mode: null, currency: 'ZAR' };

// Everything, including the subscription, comes from the backend.
const defaultState = {
  user: null,
  business: null,
  products: [],
  services: [],
  customers: [],
  upcomingWork: [],
  transactions: [],
  subscription: DEFAULT_SUBSCRIPTION,
  payments: DEFAULT_PAYMENTS,
  paymentHistory: [],
};

function toAppUser(supabaseUser) {
  if (!supabaseUser) return null;
  // Someone who hasn't entered their email code is not logged in, whatever session exists.
  if (!supabaseUser.email_confirmed_at && !supabaseUser.confirmed_at) return null;
  return {
    name: supabaseUser.user_metadata?.full_name || supabaseUser.email,
    identifier: supabaseUser.email,
    phone: supabaseUser.user_metadata?.phone || '',
  };
}

// ---- snake_case (backend/SQL) <-> camelCase (app screens) translators ----

function fromApiBusiness(row) {
  if (!row) return null;
  return {
    name: row.name,
    type: row.type,
    businessModel: row.business_model,
    currency: normalizeCurrency(row.currency),
    products: row.products_text,
    location: row.location,
    hours: row.hours,
    goals: row.goals,
    language: resolveLanguage(row.language), // English | Afrikaans | isiZulu, or null
  };
}

function fromApiProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    stock: Number(row.stock),
    lowStockThreshold: Number(row.low_stock_threshold),
    price: Number(row.price),
    cost: Number(row.cost),
  };
}

function fromApiService(row) {
  return { id: row.id, name: row.name, price: Number(row.price), duration: row.duration, category: row.category };
}

function fromApiCustomer(row) {
  return { id: row.id, name: row.name, phone: row.phone || '', email: row.email || '' };
}

function fromApiWork(row) {
  return {
    id: row.id,
    title: row.title,
    service: row.service,
    customerId: row.customer_id || '',
    date: row.date,
    time: row.time,
    status: row.status,
    completedAt: row.completed_at || null,
    statusChangedAt: row.status_changed_at || null,
    rescheduledFrom: row.rescheduled_from || '',
    rescheduleCount: Number(row.reschedule_count || 0),
    notes: row.notes || '',
    price: row.price == null ? null : Number(row.price), // agreed price of the booking
    reminders: Array.isArray(row.reminders) ? row.reminders : [], // reminder codes, see lib/reminders.js
  };
}

function fromApiTransaction(row) {
  return {
    id: row.id,
    type: row.type,
    product: row.product,
    title: row.title,
    quantity: Number(row.quantity),
    amount: Number(row.amount),
    date: row.date,
    note: row.note,
    createdAt: row.created_at || null,
    // Income recorded by completing a booking keeps its link to the booking and customer.
    source: row.source || 'manual',
    bookingId: row.booking_id || null,
    customerId: row.customer_id || null,
    bookingPrice: row.booking_price == null ? null : Number(row.booking_price),
    updatedAt: row.updated_at || null,
    editHistory: Array.isArray(row.edit_history) ? row.edit_history : [],
  };
}

// Applies what the server did to a booking's income (completing records it, undoing removes it) to the
// app's list of transactions straight away, so Transactions and every total update without waiting.
function withIncome(state, income) {
  if (!income) return state;
  let transactions = state.transactions;
  if (income.transaction) {
    const t = fromApiTransaction(income.transaction);
    transactions = transactions.some((x) => x.id === t.id) ? transactions.map((x) => (x.id === t.id ? t : x)) : [t, ...transactions];
  }
  if (income.removed?.length) transactions = transactions.filter((x) => !income.removed.includes(x.id));
  return { ...state, transactions };
}

// What each part of the app's data is loaded from, for refreshing just the parts a change touched.
const RESOURCES = {
  products: { path: '/products', map: fromApiProduct },
  services: { path: '/services', map: fromApiService },
  customers: { path: '/customers', map: fromApiCustomer },
  work: { path: '/work', map: fromApiWork },
  transactions: { path: '/transactions', map: fromApiTransaction },
};

// Always ask Supabase for the current session token right before a request.
// It refreshes an expired token automatically, so nothing fails with
// "Invalid or expired session" after the app has been open a while.
async function getAccessToken(fallbackSession) {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) return data.session.access_token;
  } catch (e) {
    // fall through to the last known token
  }
  return fallbackSession?.access_token || null;
}

const apiClient = createApiClient({
  baseUrl: API_URL,
  getToken: () => getAccessToken(null),
  refreshToken: async () => {
    try {
      const { data } = await supabase.auth.refreshSession();
      return data?.session?.access_token || null;
    } catch (e) {
      return null;
    }
  },
  verbose: typeof __DEV__ !== 'undefined' && __DEV__,
});

// Every backend call goes through here. (The first argument used to carry a
// possibly-stale token; it is ignored now because the client fetches a fresh one.)
function apiRequest(_session, path, options = {}) {
  return apiClient.request(path, options);
}

// Turns a failed request into a sentence a person can act on.
function friendlyError(e) {
  const message = String(e?.message || '');
  if (e?.timeout) return tr('err.timeout');
  if (e?.network || /failed to fetch|network request failed|networkerror|load failed/i.test(message)) {
    // On a phone, a fallback address (localhost / the emulator's 10.0.2.2) means the app could not work out
    // where the computer is (usually because Expo runs in tunnel mode): say how to fix that.
    if (Platform.OS !== 'web' && /default/.test(API_URL_SOURCE)) return tr('err.unreachableNoHost', { url: API_URL });
    return tr('err.unreachable', { url: API_URL });
  }
  if (/invalid or expired session|not logged in/i.test(message)) return tr('err.sessionExpired');
  return message || tr('err.generic');
}

// Sends a recording to the server's speech-to-text (/ai/transcribe) through the shared API client, so
// it uses the same server address, login refresh and timeouts as every other request.
// -> { ok: true, text, language? } | { ok: false, error, code, aborted? }. Never throws.
async function transcribeRecording({ uri, language, signal, name, timeoutMs }) {
  let payload;
  try {
    payload = await readRecording(uri, { name });
  } catch (e) {
    const code = e instanceof RecordingError ? e.code : 'unreadable';
    console.warn(`[voice] could not read the recording (${code}):`, e?.message);
    return { ok: false, code, error: tr(code === 'too_large' ? 'voiceErr.tooLarge' : code === 'empty' ? 'voiceErr.empty' : 'voiceErr.unreadable') };
  }
  // A dropped connection (switching Wi-Fi / mobile data, a tunnel) is retried twice before giving up; the
  // recording stays saved on the device either way. The server's own answers (busy, not set up) are not retried.
  const body = JSON.stringify({ ...payload, language });
  for (let attempt = 0; ; attempt++) {
    try {
      const data = await apiRequest(null, '/ai/transcribe', { method: 'POST', body, signal, timeoutMs });
      return { ok: true, text: String(data?.text || '').trim(), language: data?.language || null };
    } catch (e) {
      if (e?.name === 'AbortError' || signal?.aborted) return { ok: false, aborted: true, error: tr('err.cancelled') };
      if (e?.network && attempt < 2) {
        await new Promise((r) => setTimeout(r, attempt === 0 ? 1500 : 3500));
        if (signal?.aborted) return { ok: false, aborted: true, error: tr('err.cancelled') };
        continue;
      }
      return { ok: false, error: voiceErrorMessage(e, 'transcribe'), code: e?.code || (e?.timeout ? 'timeout' : e?.network ? 'network' : String(e?.status || '')) };
    }
  }
}

// What went wrong with a voice request, in words a person can act on: the server's own message when it
// answered (e.g. speech-to-text not set up, busy), otherwise whether it was slow or unreachable.
function voiceErrorMessage(e, kind) {
  if (e?.timeout) return kind === 'transcribe' ? tr('err.transcriptionSlow') : tr('err.timeout');
  if (e?.network) return friendlyError(e);
  if (e?.status === 401) return tr('err.sessionExpired');
  return e?.message || (kind === 'transcribe' ? tr('err.transcriptionFailed', { status: e?.status || 0 }) : tr('err.generic'));
}

// Calls the backend's public /auth routes (no login token yet).
// -> { ok, status, data } and never throws.
async function publicRequest(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) console.warn(`[auth] POST ${path} -> ${res.status}${data?.code ? ` (${data.code})` : ''}`);
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    console.warn(`[auth] POST ${path} failed:`, e?.name === 'AbortError' ? 'timeout' : e?.message);
    return {
      ok: false,
      status: 0,
      data: { error: friendlyError(e?.name === 'AbortError' ? { timeout: true } : { network: true }), code: 'network' },
    };
  } finally {
    clearTimeout(timer);
  }
}

const isSessionError = (e) => e?.status === 401 && /invalid or expired session/i.test(String(e?.message || ''));
const isUnverifiedError = (e) => e?.status === 403 && e?.code === 'email_not_verified';
// An administrator suspended this account (admin portal): the session is ended and Login explains why.
const isSuspendedError = (e) => e?.status === 403 && e?.code === 'account_suspended';
const isBannedLoginError = (error) => error?.code === 'user_banned' || /banned/i.test(String(error?.message || ''));

// Generic call for feature screens (the Sponsored page): same server address, login refresh, timeouts and
// error wording as everything else. Defined once here so its identity never changes (screens use it in effects).
//   -> { ok: true, data } | { ok: false, error, code, status }
async function apiCall(path, options = {}) {
  try {
    return { ok: true, data: await apiRequest(null, path, options) };
  } catch (e) {
    if (isSessionError(e) || isSuspendedError(e)) supabase.auth.signOut();
    return { ok: false, error: friendlyError(e), code: e?.code || '', status: e?.status || 0 };
  }
}

export function AppProvider({ children }) {
  const [state, setState] = useState(defaultState);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const isReady = sessionChecked && storageLoaded; // don't pick a first screen until both are known
  const [session, setSession] = useState(null);
  const hasLoaded = useRef(false);

  // A recovery key to show the owner once (after signing up, resetting the password, activating an older
  // account, or making a new key). Kept in memory only, never stored on the device: if the app is closed
  // before it is saved, a new key can be made in Profile.   { key, reason: 'registered'|'reset'|'activated'|'new' }
  const [recoveryNotice, setRecoveryNotice] = useState(null);

  // Nothing about plans or payments is read from the device any more: a stored plan could be edited
  // by anyone, so only the server's answer counts. (Older versions kept a pretend plan here: wipe it.)
  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        // nothing to clean
      } finally {
        hasLoaded.current = true;
      }
      // Older versions kept "waiting for an emailed code" on the device; that step no longer exists.
      AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
      setStorageLoaded(true);
    })();
  }, []);

  useEffect(() => {
    // A session whose email was never verified is thrown away, never treated as logged in.
    const accept = (newSession) => {
      if (newSession?.user && !toAppUser(newSession.user)) {
        supabase.auth.signOut().catch(() => {});
        setSession(null);
        setState((s) => ({ ...s, user: null }));
        return;
      }
      setSession(newSession);
      setState((s) => ({ ...s, user: toAppUser(newSession?.user) }));
    };
    supabase.auth.getSession().then(({ data }) => {
      accept(data.session);
      setSessionChecked(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => accept(newSession));

    return () => listener.subscription.unsubscribe();
  }, []);

  // ---- Loading data from the backend ----
  //
  // dataStatus: 'idle' (not logged in / not started) | 'loading' (first load) |
  //             'ready' | 'error' (first load failed - the app shows a Retry screen)
  // Later reloads are silent: they refresh what is on screen without flashing a loader.
  const [dataStatus, setDataStatus] = useState('idle');
  const [dataError, setDataError] = useState(null);
  const [syncError, setSyncError] = useState(null); // { id, message } - the last save/delete that failed
  const loadingRef = useRef(null);
  const lastLoadAt = useRef(0);
  const refreshTimer = useRef(null);
  const userId = state.user ? session?.user?.id || null : null;

  // A payment the person started on Paystack's page. It is remembered on the device so that, when they
  // come back (even after the browser tab reloaded), the app can ask the server how it went.
  const [paymentResult, setPaymentResult] = useState(null);
  const trackPayment = useCallback(async (reference) => {
    try {
      await AsyncStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify({ reference, at: Date.now() }));
    } catch (e) { /* the screen still polls while it is open */ }
  }, []);
  const clearTrackedPayment = useCallback(async () => {
    try { await AsyncStorage.removeItem(PENDING_PAYMENT_KEY); } catch (e) { /* nothing to clear */ }
  }, []);
  const getTrackedPayment = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_PAYMENT_KEY);
      const v = raw ? JSON.parse(raw) : null;
      if (!v?.reference || Date.now() - Number(v.at || 0) > PENDING_PAYMENT_MAX_AGE_MS) {
        if (raw) await AsyncStorage.removeItem(PENDING_PAYMENT_KEY);
        return null;
      }
      return v.reference;
    } catch (e) { return null; }
  }, []);
  // After every load: if a payment was left open, ask the server what happened to it.
  const settleTrackedPayment = useCallback(async () => {
    const reference = await getTrackedPayment();
    if (!reference) return;
    try {
      const r = await apiRequest(null, `/payments/verify/${encodeURIComponent(reference)}`);
      if (r.payment?.status && r.payment.status !== 'pending') {
        await clearTrackedPayment();
        setPaymentResult(r.payment);
        setState((s) => ({ ...s, subscription: r.subscription }));
      }
    } catch (e) {
      if (e?.status === 404) await clearTrackedPayment(); // not ours / gone
    }
  }, [getTrackedPayment, clearTrackedPayment]);

  const mutationSeq = useRef(0);

  const loadAll = useCallback(async ({ silent = false } = {}) => {
    if (loadingRef.current) return loadingRef.current;
    const run = (async () => {
      if (!silent) {
        setDataStatus('loading');
        setDataError(null);
      }
      const seq = mutationSeq.current;
      try {
        const business = await apiRequest(null, '/business');
        if (!business) {
          setState((s) => ({ ...s, business: null, products: [], services: [], customers: [], upcomingWork: [], transactions: [] }));
        } else {
          const [products, services, customers, work, transactions, billing] = await Promise.all([
            apiRequest(null, '/products'),
            apiRequest(null, '/services'),
            apiRequest(null, '/customers'),
            apiRequest(null, '/work'),
            apiRequest(null, '/transactions'),
            // Plan + payment status. If this fails the rest of the app still loads (as Free).
            apiRequest(null, '/payments/subscription').catch((e) => {
              console.warn('[billing] could not load subscription:', e?.message);
              return null;
            }),
          ]);
          // A save finished while this was loading: these rows may be older than what is on screen.
          // Keep the screen as it is; the refresh that follows that save brings the latest data.
          if (silent && seq !== mutationSeq.current) {
            lastLoadAt.current = Date.now();
            return;
          }
          setState((s) => ({
            ...s,
            business: fromApiBusiness(business),
            products: products.map(fromApiProduct),
            services: services.map(fromApiService),
            customers: customers.map(fromApiCustomer),
            upcomingWork: work.map(fromApiWork),
            transactions: transactions.map(fromApiTransaction),
            ...(billing ? { subscription: billing.subscription, payments: billing.payments || DEFAULT_PAYMENTS, paymentHistory: billing.payment_history || [] } : {}),
          }));
        }
        lastLoadAt.current = Date.now();
        setDataStatus('ready');
        settleTrackedPayment();
        setDataError(null);
      } catch (e) {
        console.warn(`[sync] ${silent ? 'background refresh' : 'load'} failed:`, e?.message);
        // A rejected login (e.g. the user was deleted) means the saved session is
        // stale: sign out so the app falls back to Login instead of getting stuck.
        if (isSessionError(e)) {
          await supabase.auth.signOut();
          return;
        }
        // An account from the old email sign-up that was never activated: log in again to activate it.
        if (isUnverifiedError(e)) {
          await supabase.auth.signOut();
          return;
        }
        // Suspended by an administrator: sign out (Login shows the reason when they try again).
        if (isSuspendedError(e)) {
          await supabase.auth.signOut();
          return;
        }
        // A failed background refresh keeps showing what is already on screen, and says so once.
        if (!silent) {
          setDataStatus('error');
          setDataError(friendlyError(e));
        } else if (!/aborted/i.test(String(e?.message || ''))) {
          setSyncError({ id: Date.now(), message: tr('sync.refreshFailed', { reason: friendlyError(e) }) });
        }
      }
    })().finally(() => {
      loadingRef.current = null;
    });
    loadingRef.current = run;
    return run;
  }, [session?.user?.email, settleTrackedPayment]);

  // Load when a person logs in (or a different person does); reset when they log out.
  useEffect(() => {
    clearTimeout(refreshTimer.current);
    if (!userId) {
      setDataStatus('idle');
      setDataError(null);
      lastLoadAt.current = 0;
      return;
    }
    setState((s) => ({ ...s, business: null, products: [], services: [], customers: [], upcomingWork: [], transactions: [], subscription: DEFAULT_SUBSCRIPTION, payments: DEFAULT_PAYMENTS, paymentHistory: [] }));
    loadAll();
  }, [userId, loadAll]);

  // Pick up changes made elsewhere (another phone, the web app) when the app comes back to the front.
  useEffect(() => {
    if (!userId) return undefined;
    const refreshIfStale = () => {
      if (Date.now() - lastLoadAt.current > 15000) loadAll({ silent: true });
    };
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refreshIfStale();
    });
    let onVisible;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      onVisible = () => {
        if (document.visibilityState === 'visible') refreshIfStale();
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);
    }
    return () => {
      sub?.remove?.();
      if (onVisible) {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
      }
    };
  }, [userId, loadAll]);

  // After a change, re-read just what that change can affect (e.g. a sale -> transactions and stock),
  // shortly afterwards, so the screen ends up matching the database without reloading everything.
  // Changes made close together are combined into one refresh. 'all' reloads everything.
  const pendingRefresh = useRef(new Set());
  const refreshSoon = useCallback(
    (...keys) => {
      mutationSeq.current += 1; // anything still loading from before this change is now out of date
      (keys.length ? keys : ['all']).forEach((k) => pendingRefresh.current.add(k));
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(async () => {
        const wanted = [...pendingRefresh.current];
        pendingRefresh.current.clear();
        if (wanted.includes('all')) return loadAll({ silent: true });
        const seq = mutationSeq.current;
        try {
          const results = await Promise.all(wanted.map((k) => apiRequest(null, RESOURCES[k].path)));
          if (seq !== mutationSeq.current) return; // another change happened meanwhile; its own refresh follows
          setState((st) => {
            const next = { ...st };
            wanted.forEach((k, i) => {
              next[k === 'work' ? 'upcomingWork' : k] = (results[i] || []).map(RESOURCES[k].map);
            });
            return next;
          });
        } catch (e) {
          console.warn('[sync] refresh after a change failed:', e?.message);
          if (isSessionError(e) || isSuspendedError(e)) supabase.auth.signOut();
        }
      }, 1200);
    },
    [loadAll]
  );

  // A save / delete failed: log it and return a result instead of throwing. Every screen shows the
  // returned error next to the form or button the person used (so it is never shown twice); an expired
  // login signs out, which returns the app to the Log in screen.
  const fail = useCallback((action, e) => {
    const message = friendlyError(e);
    console.warn(`[sync] ${action} failed:`, e?.message);
    if (isSessionError(e) || isSuspendedError(e)) supabase.auth.signOut();
    return { ok: false, error: `${action}: ${message}` };
  }, []);

  const api = useMemo(() => {
    return {
      state,
      isReady,
      session,
      dataStatus,
      dataError,
      syncError,
      clearSyncError: () => setSyncError(null),
      refreshData: () => loadAll({ silent: false }),
      // Pull-to-refresh: reloads everything without replacing the screen with a loader.
      reloadData: () => loadAll({ silent: true }),

      // Creates the account on the server (no email is sent), logs in, and shows the account's recovery key once.
      //   -> { ok:true } | { ok:false, error, code }
      register: async ({ fullName, phone, email, password, confirmPassword }) => {
        const cleanEmail = (email || '').trim().toLowerCase();
        if (!fullName?.trim() || !cleanEmail || !password) {
          return { ok: false, error: tr('err.fillRegister') };
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
          return { ok: false, error: tr('err.validEmail') };
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
          return { ok: false, error: tr('err.passwordLength', { count: MIN_PASSWORD_LENGTH }) };
        }
        if (password !== confirmPassword) {
          return { ok: false, error: tr('err.passwordsMatch') };
        }
        const res = await publicRequest('/auth/register', {
          fullName: fullName.trim(),
          phone: phone?.trim() || '',
          email: cleanEmail,
          password,
        });
        if (!res.ok) return { ok: false, error: res.data?.error || tr('err.generic'), code: res.data?.code };
        if (res.data?.recoveryKey) setRecoveryNotice({ key: res.data.recoveryKey, reason: 'registered' });
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) return { ok: true, signedIn: false, error: friendlyError(error) };
        return { ok: true, signedIn: true };
      },

      login: async ({ identifier, password }) => {
        const cleanEmail = (identifier || '').trim().toLowerCase();
        if (!cleanEmail || !password) {
          return { ok: false, error: tr('err.enterEmailPassword') };
        }
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) {
          if (isBannedLoginError(error)) return { ok: false, error: tr('err.accountSuspended') };
          // An account from the old email sign-up that never entered its code: the right password activates it.
          if (error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message || '')) {
            const act = await publicRequest('/auth/activate', { email: cleanEmail, password });
            if (!act.ok) return { ok: false, error: act.data?.error || tr('err.generic') };
            if (act.data?.recoveryKey) setRecoveryNotice({ key: act.data.recoveryKey, reason: 'activated' });
            const again = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
            if (again.error) return { ok: false, error: again.error.message };
            return { ok: true };
          }
          return { ok: false, error: error.message };
        }
        return { ok: true };
      },

      loginWithGoogle: async () => ({ ok: false, error: tr('err.googleNotSetUp') }),

      // Forgot password: email + recovery key + new password. On success the person is logged in and sees
      // their NEW recovery key (the one they used no longer works).   -> { ok:true } | { ok:false, error, field?, code? }
      recoverAccount: async ({ email, recoveryKey, password, confirmPassword }) => {
        const cleanEmail = (email || '').trim().toLowerCase();
        const key = String(recoveryKey || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) return { ok: false, field: 'email', error: tr('err.validEmail') };
        if (key.length !== 20) return { ok: false, field: 'recoveryKey', error: tr('recovery.errKeyFormat') };
        if (!password || password.length < MIN_PASSWORD_LENGTH) return { ok: false, field: 'password', error: tr('err.passwordLength', { count: MIN_PASSWORD_LENGTH }) };
        if (password !== confirmPassword) return { ok: false, field: 'confirmPassword', error: tr('err.passwordsMatch') };
        const res = await publicRequest('/auth/recover', { email: cleanEmail, recoveryKey: key, password });
        if (!res.ok) return { ok: false, error: res.data?.error || tr('err.generic'), code: res.data?.code, field: res.data?.code === 'invalid_key' ? 'recoveryKey' : undefined };
        if (res.data?.recoveryKey) setRecoveryNotice({ key: res.data.recoveryKey, reason: 'reset' });
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) return { ok: true, signedIn: false };
        return { ok: true, signedIn: true };
      },

      // Logged in: does this account have a recovery key?  -> { ok, hasKey, createdAt }
      getRecoveryStatus: async () => {
        try {
          const data = await apiRequest(session, '/auth/recovery-key');
          return { ok: true, hasKey: Boolean(data?.hasKey), createdAt: data?.createdAt || null };
        } catch (e) {
          return { ok: false, error: friendlyError(e) };
        }
      },

      // Logged in: replace the recovery key (asks for the password). The new key is shown once.
      createRecoveryKey: async (password) => {
        if (!password) return { ok: false, error: tr('recovery.errPassword') };
        try {
          const data = await apiRequest(session, '/auth/recovery-key', { method: 'POST', body: JSON.stringify({ password }) });
          return { ok: true, key: data.recoveryKey }; // shown on the Profile page, once
        } catch (e) {
          return { ok: false, error: e?.status === 401 ? tr('recovery.errWrongPassword') : friendlyError(e) };
        }
      },

      recoveryNotice,
      dismissRecoveryNotice: () => setRecoveryNotice(null),

      logout: async () => {
        await supabase.auth.signOut();
        setState((s) => ({
          ...s,
          business: null,
          products: [],
          services: [],
          customers: [],
          upcomingWork: [],
          transactions: [],
        }));
      },

      // Name and phone number. (The login email is not changed here.)
      updateUserProfile: async ({ name, phone }) => {
        const fullName = String(name || '').replace(/\s+/g, ' ').trim();
        if (!fullName) return { ok: false, error: tr('profile.nameRequired') };
        try {
          const { data, error } = await supabase.auth.updateUser({ data: { full_name: fullName, phone: String(phone || '').trim() } });
          if (error) return { ok: false, error: friendlyError(error) };
          setState((s) => ({ ...s, user: toAppUser(data?.user) || (s.user ? { ...s.user, name: fullName, phone: String(phone || '').trim() } : s.user) }));
          return { ok: true };
        } catch (e) {
          return { ok: false, error: friendlyError(e) };
        }
      },

      saveBusiness: async (business) => {
        try {
          const data = await apiRequest(session, '/business', { method: 'PUT', body: JSON.stringify(business) });
          setState((s) => ({ ...s, business: fromApiBusiness(data) }));
          refreshSoon('all');
          return { ok: true };
        } catch (e) {
          return fail(tr('sync.couldnTSaveYourBusiness'), e);
        }
      },

      // ---- Services ----

      addService: async (service) => {
        try {
          const data = await apiRequest(session, '/services', { method: 'POST', body: JSON.stringify(service) });
          const created = fromApiService(data);
          setState((s) => ({ ...s, services: [...s.services, created] }));
          refreshSoon('services');
          return { ok: true, data: created };
        } catch (e) {
          return fail(tr('sync.couldnTAddTheService'), e);
        }
      },

      updateService: async (serviceId, service) => {
        try {
          const data = await apiRequest(session, `/services/${serviceId}`, { method: 'PUT', body: JSON.stringify(service) });
          const updated = fromApiService(data);
          setState((s) => ({ ...s, services: s.services.map((item) => (item.id === serviceId ? updated : item)) }));
          refreshSoon('services');
          return { ok: true, data: updated };
        } catch (e) {
          return fail(tr('sync.couldnTUpdateTheService'), e);
        }
      },

      deleteService: async (serviceId) => {
        try {
          await apiRequest(session, `/services/${serviceId}`, { method: 'DELETE' });
          setState((s) => ({ ...s, services: s.services.filter((service) => service.id !== serviceId) }));
          refreshSoon('services', 'work');
          return { ok: true };
        } catch (e) {
          return fail(tr('sync.couldnTDeleteTheService'), e);
        }
      },

      // ---- Customers ----

      addCustomer: async (customer) => {
        try {
          const data = await apiRequest(session, '/customers', { method: 'POST', body: JSON.stringify(customer) });
          const created = fromApiCustomer(data);
          setState((s) => ({ ...s, customers: [...s.customers, created] }));
          refreshSoon('customers');
          return { ok: true, data: created };
        } catch (e) {
          return fail(tr('sync.couldnTAddTheCustomer'), e);
        }
      },

      updateCustomer: async (customerId, customer) => {
        try {
          const data = await apiRequest(session, `/customers/${customerId}`, { method: 'PUT', body: JSON.stringify(customer) });
          const updated = fromApiCustomer(data);
          setState((s) => ({ ...s, customers: s.customers.map((item) => (item.id === customerId ? updated : item)) }));
          refreshSoon('customers');
          return { ok: true, data: updated };
        } catch (e) {
          return fail(tr('sync.couldnTUpdateTheCustomer'), e);
        }
      },

      deleteCustomer: async (customerId) => {
        try {
          // The backend already clears customer_id off any of this customer's
          // upcoming_work rows; mirror that locally so the UI matches at once.
          await apiRequest(session, `/customers/${customerId}`, { method: 'DELETE' });
          setState((s) => ({
            ...s,
            customers: s.customers.filter((customer) => customer.id !== customerId),
            upcomingWork: s.upcomingWork.map((work) => (work.customerId === customerId ? { ...work, customerId: '' } : work)),
          }));
          refreshSoon('customers', 'work');
          return { ok: true };
        } catch (e) {
          return fail(tr('sync.couldnTDeleteTheCustomer'), e);
        }
      },

      // ---- Upcoming work / bookings ----

      // Edits a recorded transaction (amount, description, category, date, note, quantity).
      updateTransaction: async (transactionId, fields) => {
        try {
          const data = await apiRequest(session, `/transactions/${transactionId}`, { method: 'PUT', body: JSON.stringify(fields) });
          const updated = fromApiTransaction(data);
          setState((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === transactionId ? updated : t)) }));
          refreshSoon('transactions', 'products');
          return { ok: true, data: updated };
        } catch (e) {
          return fail(tr('sync.couldntUpdateTransaction'), e);
        }
      },

      addUpcomingWork: async (work) => {
        try {
          const data = await apiRequest(session, '/work', { method: 'POST', body: JSON.stringify(work) });
          const created = fromApiWork(data);
          setState((s) => withIncome({ ...s, upcomingWork: [...s.upcomingWork, created] }, data.income));
          refreshSoon('work', 'transactions');
          return { ok: true, income: data.income || null, data: created };
        } catch (e) {
          return fail(tr('sync.couldnTSaveTheAppointment'), e);
        }
      },

      updateUpcomingWork: async (workId, work) => {
        try {
          const data = await apiRequest(session, `/work/${workId}`, { method: 'PUT', body: JSON.stringify(work) });
          const updated = fromApiWork(data);
          setState((s) => withIncome({ ...s, upcomingWork: s.upcomingWork.map((item) => (item.id === workId ? updated : item)) }, data.income));
          refreshSoon('work', 'transactions');
          return { ok: true, income: data.income || null, data: updated };
        } catch (e) {
          return fail(tr('sync.couldnTUpdateTheAppointment'), e);
        }
      },

      deleteUpcomingWork: async (workId) => {
        try {
          await apiRequest(session, `/work/${workId}`, { method: 'DELETE' });
          setState((s) => ({ ...s, upcomingWork: s.upcomingWork.filter((work) => work.id !== workId) }));
          refreshSoon('work', 'transactions');
          return { ok: true };
        } catch (e) {
          return fail(tr('sync.couldnTDeleteTheAppointment'), e);
        }
      },

      // ---- Transactions ----
      // The backend decrements matching product stock for a sale. The same
      // decrement is mirrored locally so Dashboard/Stock update instantly; the
      // follow-up refresh then makes sure they match the database exactly.
      addTransaction: async (txn) => {
        try {
          const data = await apiRequest(session, '/transactions', { method: 'POST', body: JSON.stringify(txn) });
          const newTxn = fromApiTransaction(data);
          setState((s) => {
            const products = [...s.products];
            if (newTxn.type === 'sale') {
              // Same rule as the server: the product is matched by name, ignoring upper/lower case.
              const wanted = String(newTxn.product || '').trim().toLowerCase();
              const idx = products.findIndex((p) => String(p.name || '').trim().toLowerCase() === wanted);
              if (idx >= 0) {
                products[idx] = { ...products[idx], stock: Math.max(0, products[idx].stock - newTxn.quantity) };
              }
            }
            return { ...s, transactions: [newTxn, ...s.transactions], products };
          });
          refreshSoon('transactions', 'products');
          return { ok: true, data: newTxn };
        } catch (e) {
          return fail(tr('sync.couldnTRecordTheTransaction'), e);
        }
      },

      addStock: async ({ product, quantity, amount }) => {
        try {
          const data = await apiRequest(session, '/products/restock', {
            method: 'POST',
            body: JSON.stringify({ product, quantity, amount }),
          });
          const updatedProduct = fromApiProduct(data.product);
          setState((s) => {
            const exists = s.products.some((p) => p.id === updatedProduct.id);
            const products = exists
              ? s.products.map((p) => (p.id === updatedProduct.id ? updatedProduct : p))
              : [...s.products, updatedProduct];
            return { ...s, products, transactions: [fromApiTransaction(data.transaction), ...s.transactions] };
          });
          refreshSoon('products', 'transactions');
          return { ok: true, data: { product: updatedProduct, created: !state.products.some((p) => p.id === updatedProduct.id) } };
        } catch (e) {
          return fail(tr('sync.couldnTAddTheStock'), e);
        }
      },

      // Edits a product's details (name, category, price, cost, low-stock level, stock count).
      updateProduct: async (productId, fields) => {
        try {
          const data = await apiRequest(session, `/products/${productId}`, { method: 'PUT', body: JSON.stringify(fields) });
          const updated = fromApiProduct(data);
          setState((s) => ({ ...s, products: s.products.map((p) => (p.id === productId ? updated : p)) }));
          refreshSoon('products');
          return { ok: true, data: updated };
        } catch (e) {
          return fail(tr('sync.couldntUpdateProduct'), e);
        }
      },

      // Deletes a recorded sale / expense. The server puts a deleted sale's units back in stock.
      deleteTransaction: async (transactionId) => {
        try {
          const r = await apiRequest(session, `/transactions/${transactionId}`, { method: 'DELETE' });
          setState((s) => ({
            ...s,
            transactions: s.transactions.filter((t) => t.id !== transactionId),
            products:
              r?.stock?.product && r.stock.after !== null && r.stock.after !== undefined
                ? s.products.map((p) => (p.name === r.stock.product ? { ...p, stock: Number(r.stock.after) } : p))
                : s.products,
          }));
          refreshSoon('transactions', 'products');
          return { ok: true, stock: r?.stock || null };
        } catch (e) {
          return fail(tr('sync.couldntDeleteTransaction'), e);
        }
      },

      deleteProduct: async (productId) => {
        try {
          await apiRequest(session, `/products/${productId}`, { method: 'DELETE' });
          setState((s) => ({ ...s, products: s.products.filter((product) => product.id !== productId) }));
          refreshSoon('products');
          return { ok: true };
        } catch (e) {
          return fail(tr('sync.couldnTDeleteTheProduct'), e);
        }
      },

      updateProductPrice: async (productId, price) => {
        try {
          const data = await apiRequest(session, `/products/${productId}/price`, {
            method: 'PATCH',
            body: JSON.stringify({ price }),
          });
          const updated = fromApiProduct(data);
          setState((s) => ({ ...s, products: s.products.map((p) => (p.id === productId ? updated : p)) }));
          refreshSoon('products');
          return { ok: true };
        } catch (e) {
          return fail(tr('sync.couldnTUpdateThePrice'), e);
        }
      },

      // The chat reply comes from the backend's /ai/chat route. With a free
      // Groq key set on the server it is a real AI answer grounded in this
      // business's data; without one (or if Groq is unavailable) the server
      // falls back to the rule-based replies in aiEngine.js.
      //
      //   chatWithAI({ message, intentKey?, history? })  -> reply text
      //   history: [{ role: 'user' | 'assistant', content }]
      //
      // Passing a bare string (the old chatWithAI(intentKey) form) still works.
      chatWithAI: async (arg) => {
        const { message = '', intentKey = 'default', history = [] } =
          typeof arg === 'string' ? { intentKey: arg } : arg || {};
        try {
          const token = await getAccessToken(session);
          const data = await apiRequest({ access_token: token }, '/ai/chat', {
            method: 'POST',
            body: JSON.stringify({ message, intentKey, history, uiLanguage: getLanguage() }),
          });
          // The assistant can now add / change records itself: show them straight away.
          if (data.changed?.length) loadAll({ silent: true });
          // Canned replies the server sends (quota, rate limit) are shown in the app's own language.
          if (data.source === 'limit') return data.code === 'upgrade_required' ? tr('err.quotaUsed', { limit: data.limit ?? 20 }) : tr('err.tooFast');
          return data.reply;
        } catch (e) {
          return tr('err.chatUnreachable');
        }
      },

      // Speech-to-text for a recorded voice note or a chat question (voice notes: lib/voiceNotes.js;
      // chat: AIChatPanel). Never throws: { ok: true, text, language? } | { ok: false, error, code }.
      transcribeAudio: ({ uri, language = 'en' }) => transcribeRecording({ uri, language, name: 'voice-note', timeoutMs: 90000 }),

      // Live Voice: one spoken segment (language may be 'auto'); the caller can cancel it.
      transcribeLive: ({ uri, language = 'auto', signal }) => transcribeRecording({ uri, language, signal, name: 'live', timeoutMs: 30000 }),

      // Live Voice: one spoken reply (conversation) or one translation (interpreter).
      //   -> { ok, reply, to, from, ... } | { ok:false, error, aborted? }
      voiceRespond: async ({ text, from, mode, targetLang, homeLang, history = [], signal, turnId, supersedes, sticky }) => {
        try {
          const data = await apiRequest(null, '/ai/voice/reply', {
            method: 'POST',
            body: JSON.stringify({ text, from, mode, targetLang, homeLang, history, turnId, supersedes, sticky, uiLanguage: getLanguage() }),
            signal,
            timeoutMs: 45000,
          });
          // Records the assistant just added or changed: refresh the screens behind the voice view.
          if (data.changed?.length) loadAll({ silent: true });
          return { ok: true, reply: data.reply, to: data.to, from: data.from, sticky: data.sticky, actions: data.actions, changed: data.changed };
        } catch (e) {
          if (e?.name === 'AbortError' || signal?.aborted) return { ok: false, aborted: true, error: tr('err.cancelled') };
          return { ok: false, error: voiceErrorMessage(e, 'reply'), code: e?.code || (e?.network ? 'network' : '') };
        }
      },

      // ---- Generic call for feature screens (Sponsored page); same function every render ----
      apiCall,

      // ---- Subscription & payments (Paystack) ----
      // The app never decides what a person has paid for. It asks the server to start a payment, sends
      // the person to Paystack's checkout, and then asks the server to verify. Only the server's
      // answer changes the plan.
      paymentResult,
      clearPaymentResult: () => setPaymentResult(null),
      trackPayment,
      clearTrackedPayment,
      getTrackedPayment,
      refreshSubscription: async () => {
        try {
          const billing = await apiRequest(null, '/payments/subscription');
          setState((s) => ({ ...s, subscription: billing.subscription, payments: billing.payments || DEFAULT_PAYMENTS, paymentHistory: billing.payment_history || [] }));
          return { ok: true, subscription: billing.subscription };
        } catch (e) {
          return { ok: false, error: friendlyError(e) };
        }
      },

      // -> { ok, reference, authorizationUrl, amount, currency, mode } | { ok:false, error, code? }
      startCheckout: async ({ planId, billingCycle }) => {
        try {
          const r = await apiRequest(null, '/payments/checkout', { method: 'POST', body: JSON.stringify({ planId, billingCycle }) });
          return { ok: true, ...r };
        } catch (e) {
          return { ok: false, error: friendlyError(e), code: e?.code || '' };
        }
      },

      // Asks the server (which asks Paystack) what happened. -> { ok, payment, subscription } | { ok:false, error }
      verifyPayment: async (reference, { cancel = false } = {}) => {
        try {
          const path = cancel ? `/payments/${encodeURIComponent(reference)}/cancel` : `/payments/verify/${encodeURIComponent(reference)}`;
          const r = await apiRequest(null, path, { method: cancel ? 'POST' : 'GET' });
          setState((s) => ({ ...s, subscription: r.subscription }));
          if (r.payment?.status === 'success') loadAll({ silent: true });
          return { ok: true, payment: r.payment, subscription: r.subscription };
        } catch (e) {
          return { ok: false, error: friendlyError(e) };
        }
      },

      // The plan keeps working until the period that was paid for ends.
      cancelSubscription: async () => {
        try {
          const r = await apiRequest(null, '/payments/subscription/cancel', { method: 'POST' });
          setState((s) => ({ ...s, subscription: r.subscription }));
          return { ok: true, subscription: r.subscription };
        } catch (e) {
          return { ok: false, error: friendlyError(e) };
        }
      },
      resumeSubscription: async () => {
        try {
          const r = await apiRequest(null, '/payments/subscription/resume', { method: 'POST' });
          setState((s) => ({ ...s, subscription: r.subscription }));
          return { ok: true, subscription: r.subscription };
        } catch (e) {
          return { ok: false, error: friendlyError(e) };
        }
      },
    };
  }, [state, isReady, session, dataStatus, dataError, syncError, recoveryNotice, loadAll, refreshSoon, fail, paymentResult, trackPayment, clearTrackedPayment, getTrackedPayment]);

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
