import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { addBillingPeriod } from '../lib/payment';
import { AUDIO_EXT, AUDIO_MIME } from '../lib/voiceNotes';
import { supabase, API_URL } from '../supabaseClient';

const AppContext = createContext(null);

const STORAGE_KEY = 'ai-cofounder-state-v1';

export const MIN_PASSWORD_LENGTH = 6;

const DEFAULT_SUBSCRIPTION = {
  plan: 'Free',
  planId: 'free',
  billingCycle: null,
  status: 'active',
  paymentMethod: null,
  startedOn: null,
  renewsOn: null,
};

// Stage 3: EVERYTHING except `subscription` now comes from the backend.
// `subscription` stays local because there's no real payment gateway wired
// up yet (see payment.js's own comment about that) — that's a good next
// project after Monday, not part of this sprint.
const defaultState = {
  user: null,
  business: null,
  products: [],
  services: [],
  customers: [],
  upcomingWork: [],
  transactions: [],
  subscription: DEFAULT_SUBSCRIPTION,
};

function toAppUser(supabaseUser) {
  if (!supabaseUser) return null;
  return {
    name: supabaseUser.user_metadata?.full_name || supabaseUser.email,
    identifier: supabaseUser.email,
  };
}

// ---- snake_case (backend/SQL) <-> camelCase (app screens) translators ----

function fromApiBusiness(row) {
  if (!row) return null;
  return {
    name: row.name,
    type: row.type,
    businessModel: row.business_model,
    currency: row.currency,
    products: row.products_text,
    location: row.location,
    hours: row.hours,
    goals: row.goals,
    language: row.language,
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
  };
}

async function apiRequest(session, path, options = {}) {
  if (!session?.access_token) {
    throw new Error('Not logged in.');
  }
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

// Turns a failed request into a sentence a person can act on.
function friendlyError(e) {
  const message = String(e?.message || '');
  if (/failed to fetch|network request failed|networkerror|load failed/i.test(message)) {
    return "Couldn't reach the server. Check your connection and that the backend is running, then try again.";
  }
  if (/invalid or expired session|not logged in/i.test(message)) return 'Your session has expired. Please log in again.';
  return message || 'Something went wrong. Please try again.';
}

// Always ask Supabase for the current session token right before a request.
// It refreshes an expired token automatically, so the AI features don't
// fail with "Invalid or expired session" after the app has been open a while.
async function getAccessToken(fallbackSession) {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) return data.session.access_token;
  } catch (e) {
    // fall through to the last known token
  }
  return fallbackSession?.access_token || null;
}

export function AppProvider({ children }) {
  const [state, setState] = useState(defaultState);
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState(null);
  const hasLoaded = useRef(false);

  // Only `subscription` is loaded from AsyncStorage now.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const loaded = JSON.parse(raw);
          if (loaded.subscription) {
            setState((s) => ({ ...s, subscription: loaded.subscription }));
          }
        }
      } catch (e) {
        // ignore corrupted storage
      } finally {
        hasLoaded.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setState((s) => ({ ...s, user: toAppUser(data.session?.user) }));
      setIsReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setState((s) => ({ ...s, user: toAppUser(newSession?.user) }));
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Stage 3: on login, load EVERYTHING from the backend in one go.
  useEffect(() => {
    if (!session?.access_token) return;
    (async () => {
      try {
        const business = await apiRequest(session, '/business');
        setState((s) => ({ ...s, business: fromApiBusiness(business) }));
        if (!business) return; // nothing else to load until BusinessSetup is done

        const [products, services, customers, work, transactions] = await Promise.all([
          apiRequest(session, '/products'),
          apiRequest(session, '/services'),
          apiRequest({ access_token: await getAccessToken(session) }, '/customers'),
          apiRequest({ access_token: await getAccessToken(session) }, '/work'),
          apiRequest(session, '/transactions'),
        ]);

        setState((s) => ({
          ...s,
          products: products.map(fromApiProduct),
          services: services.map(fromApiService),
          customers: customers.map(fromApiCustomer),
          upcomingWork: work.map(fromApiWork),
          transactions: transactions.map(fromApiTransaction),
        }));
      } catch (e) {
        console.warn('Failed to load business data from backend:', e.message);
        // If the backend says our session is invalid (e.g. the underlying
        // Supabase user was deleted, or the token expired), the phone's
        // saved session is now stale. Sign out locally so the app falls
        // back to the Login screen instead of getting stuck showing
        // BusinessSetup with no way to log out.
        if (e.message.includes('Invalid or expired session')) {
          await supabase.auth.signOut();
        }
      }
    })();
  }, [session?.access_token]);

  // Only `subscription` is still saved locally now.
  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ subscription: state.subscription })).catch(() => {});
  }, [state.subscription]);

  const api = useMemo(() => {
    return {
      state,
      isReady,
      session,

      register: async ({ fullName, phone, email, password, confirmPassword }) => {
        const cleanEmail = (email || '').trim().toLowerCase();
        if (!fullName?.trim() || !cleanEmail || !password) {
          return { ok: false, error: 'Please fill in your name, email and password.' };
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
          return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
        }
        if (password !== confirmPassword) {
          return { ok: false, error: 'Passwords do not match.' };
        }
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { full_name: fullName.trim(), phone: phone?.trim() || '' } },
        });
        if (error) return { ok: false, error: error.message };
        if (!data.session) {
          return { ok: false, error: 'Account created — check your email to confirm it, then log in.' };
        }
        return { ok: true };
      },

      login: async ({ identifier, password }) => {
        const cleanEmail = (identifier || '').trim().toLowerCase();
        if (!cleanEmail || !password) {
          return { ok: false, error: 'Please enter your email and password.' };
        }
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) return { ok: false, error: error.message };
        return { ok: true };
      },

      loginWithGoogle: async () => ({ ok: false, error: 'Google sign-in isn\u2019t set up yet — please use email and password.' }),

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

      updateUserProfile: async ({ name, identifier }) => {
        const { error } = await supabase.auth.updateUser({ email: identifier, data: { full_name: name } });
        if (error) return { ok: false, error: error.message };
        return { ok: true };
      },

      saveBusiness: async (business) => {
        try {
          const data = await apiRequest(session, '/business', { method: 'PUT', body: JSON.stringify(business) });
          setState((s) => ({ ...s, business: fromApiBusiness(data) }));
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },

      // ---- Services (NEW in Stage 3: all hit the backend) ----

      addService: async (service) => {
        try {
          const data = await apiRequest(session, '/services', { method: 'POST', body: JSON.stringify(service) });
          setState((s) => ({ ...s, services: [...s.services, fromApiService(data)] }));
        } catch (e) {
          console.warn('addService failed:', e.message);
        }
      },

      updateService: async (serviceId, service) => {
        try {
          const data = await apiRequest(session, `/services/${serviceId}`, { method: 'PUT', body: JSON.stringify(service) });
          const updated = fromApiService(data);
          setState((s) => ({ ...s, services: s.services.map((item) => (item.id === serviceId ? updated : item)) }));
        } catch (e) {
          console.warn('updateService failed:', e.message);
        }
      },

      deleteService: async (serviceId) => {
        try {
          await apiRequest(session, `/services/${serviceId}`, { method: 'DELETE' });
          setState((s) => ({ ...s, services: s.services.filter((service) => service.id !== serviceId) }));
        } catch (e) {
          console.warn('deleteService failed:', e.message);
        }
      },

      // ---- Customers (NEW in Stage 3) ----

      addCustomer: async (customer) => {
        try {
          const data = await apiRequest({ access_token: await getAccessToken(session) }, '/customers', { method: 'POST', body: JSON.stringify(customer) });
          const created = fromApiCustomer(data);
          setState((s) => ({ ...s, customers: [...s.customers, created] }));
          return { ok: true, data: created };
        } catch (e) {
          console.warn('addCustomer failed:', e.message);
          return { ok: false, error: friendlyError(e) };
        }
      },

      updateCustomer: async (customerId, customer) => {
        try {
          const data = await apiRequest({ access_token: await getAccessToken(session) }, `/customers/${customerId}`, { method: 'PUT', body: JSON.stringify(customer) });
          const updated = fromApiCustomer(data);
          setState((s) => ({ ...s, customers: s.customers.map((item) => (item.id === customerId ? updated : item)) }));
          return { ok: true, data: updated };
        } catch (e) {
          console.warn('updateCustomer failed:', e.message);
          return { ok: false, error: friendlyError(e) };
        }
      },

      deleteCustomer: async (customerId) => {
        try {
          // The backend already clears customer_id off any of this
          // customer's upcoming_work rows — we mirror that locally too so
          // the UI matches immediately instead of waiting for a refetch.
          await apiRequest({ access_token: await getAccessToken(session) }, `/customers/${customerId}`, { method: 'DELETE' });
          setState((s) => ({
            ...s,
            customers: s.customers.filter((customer) => customer.id !== customerId),
            upcomingWork: s.upcomingWork.map((work) => (work.customerId === customerId ? { ...work, customerId: '' } : work)),
          }));
        } catch (e) {
          console.warn('deleteCustomer failed:', e.message);
        }
      },

      // ---- Upcoming work / bookings (NEW in Stage 3) ----

      addUpcomingWork: async (work) => {
        try {
          const data = await apiRequest({ access_token: await getAccessToken(session) }, '/work', { method: 'POST', body: JSON.stringify(work) });
          const created = fromApiWork(data);
          setState((s) => ({ ...s, upcomingWork: [...s.upcomingWork, created] }));
          return { ok: true, data: created };
        } catch (e) {
          console.warn('addUpcomingWork failed:', e.message);
          return { ok: false, error: friendlyError(e) };
        }
      },

      updateUpcomingWork: async (workId, work) => {
        try {
          const data = await apiRequest({ access_token: await getAccessToken(session) }, `/work/${workId}`, { method: 'PUT', body: JSON.stringify(work) });
          const updated = fromApiWork(data);
          setState((s) => ({ ...s, upcomingWork: s.upcomingWork.map((item) => (item.id === workId ? updated : item)) }));
          return { ok: true, data: updated };
        } catch (e) {
          console.warn('updateUpcomingWork failed:', e.message);
          return { ok: false, error: friendlyError(e) };
        }
      },

      deleteUpcomingWork: async (workId) => {
        try {
          await apiRequest({ access_token: await getAccessToken(session) }, `/work/${workId}`, { method: 'DELETE' });
          setState((s) => ({ ...s, upcomingWork: s.upcomingWork.filter((work) => work.id !== workId) }));
          return { ok: true };
        } catch (e) {
          console.warn('deleteUpcomingWork failed:', e.message);
          return { ok: false, error: friendlyError(e) };
        }
      },

      // ---- Transactions (NEW in Stage 3 — the last piece) ----
      // The backend decrements matching product stock server-side for a
      // sale. We mirror that same decrement on the local copy of products
      // too, so the Dashboard/Stock screens update instantly without
      // waiting on a full refetch.
      addTransaction: async (txn) => {
        try {
          const data = await apiRequest(session, '/transactions', { method: 'POST', body: JSON.stringify(txn) });
          const newTxn = fromApiTransaction(data);
          setState((s) => {
            const products = [...s.products];
            if (newTxn.type === 'sale') {
              const idx = products.findIndex((p) => p.name === newTxn.product);
              if (idx >= 0) {
                products[idx] = { ...products[idx], stock: Math.max(0, products[idx].stock - newTxn.quantity) };
              }
            }
            return { ...s, transactions: [newTxn, ...s.transactions], products };
          });
        } catch (e) {
          console.warn('addTransaction failed:', e.message);
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
        } catch (e) {
          console.warn('addStock failed:', e.message);
        }
      },

      deleteProduct: async (productId) => {
        try {
          await apiRequest(session, `/products/${productId}`, { method: 'DELETE' });
          setState((s) => ({ ...s, products: s.products.filter((product) => product.id !== productId) }));
        } catch (e) {
          console.warn('deleteProduct failed:', e.message);
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
        } catch (e) {
          console.warn('updateProductPrice failed:', e.message);
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
            body: JSON.stringify({ message, intentKey, history }),
          });
          return data.reply;
        } catch (e) {
          return "I couldn't reach the server just now — check your connection and try again.";
        }
      },

      // Speech-to-text for a recorded voice note (saved on the phone by
      // lib/voiceNotes.js). The audio is uploaded to the backend, which holds
      // the Groq key and runs Whisper. Never throws — returns
      // { ok: true, text } or { ok: false, error }.
      transcribeAudio: async ({ uri, language = 'en' }) => {
        try {
          const token = await getAccessToken(session);
          if (!token) return { ok: false, error: 'Please log in again.' };

          const form = new FormData();
          const name = `voice-note.${AUDIO_EXT}`;
          if (Platform.OS === 'web') {
            const blob = await (await fetch(uri)).blob();
            form.append('audio', blob, name);
          } else {
            form.append('audio', { uri, name, type: AUDIO_MIME });
          }
          form.append('language', language);

          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 60000);
          try {
            // No Content-Type header: fetch sets the multipart boundary itself.
            const res = await fetch(`${API_URL}/ai/transcribe`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: form,
              signal: controller.signal,
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) return { ok: false, error: data?.error || `Transcription failed (${res.status}).` };
            return { ok: true, text: (data?.text || '').trim() };
          } finally {
            clearTimeout(timer);
          }
        } catch (e) {
          return {
            ok: false,
            error:
              e?.name === 'AbortError'
                ? 'Transcription took too long. Try a shorter note.'
                : "Couldn't reach the server. Your note is saved — retry when you're online.",
          };
        }
      },

      // Subscription/billing stays local-only — see payment.js's own note
      // about there being no real payment gateway wired up yet.
      subscribe: ({ planId, planName, billingCycle, card }) =>
        setState((s) => {
          const today = new Date().toISOString().slice(0, 10);
          const paymentMethod = card
            ? { brand: card.brand, last4: card.last4, expiry: card.expiry, cardholderName: card.cardholderName }
            : s.subscription?.paymentMethod || null;
          return {
            ...s,
            subscription: {
              plan: planName,
              planId,
              billingCycle,
              status: 'active',
              paymentMethod,
              startedOn: today,
              renewsOn: planId === 'free' ? null : addBillingPeriod(today, billingCycle),
            },
          };
        }),

      cancelSubscription: () =>
        setState((s) => ({
          ...s,
          subscription: { ...DEFAULT_SUBSCRIPTION, paymentMethod: s.subscription?.paymentMethod || null },
        })),
    };
  }, [state, isReady, session]);

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
