import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addBillingPeriod } from '../lib/payment';

const AppContext = createContext(null);

const STORAGE_KEY = 'ai-cofounder-state-v1';

export const MIN_PASSWORD_LENGTH = 6;

const DEFAULT_PRODUCTS = [
  { id: 'p1', name: 'Coca-Cola 500ml', category: 'Beverages', stock: 8, lowStockThreshold: 10, price: 15.0, cost: 12.3 },
  { id: 'p2', name: 'Bread', category: 'Bakery', stock: 24, lowStockThreshold: 10, price: 18.5, cost: 14.0 },
  { id: 'p3', name: 'Chips', category: 'Snacks', stock: 5, lowStockThreshold: 10, price: 12.0, cost: 8.0 },
  { id: 'p4', name: 'Milk 1L', category: 'Dairy', stock: 18, lowStockThreshold: 8, price: 20.0, cost: 16.5 },
];

const DEFAULT_TRANSACTIONS = [
  { id: 't1', type: 'sale', product: 'Coca-Cola 500ml', quantity: 3, amount: 45.0, method: 'Cash', date: '2026-08-25' },
  { id: 't2', type: 'sale', product: 'Bread', quantity: 5, amount: 92.5, method: 'Card', date: '2026-08-26' },
  { id: 't3', type: 'expense', product: 'Stock restock', quantity: 1, amount: 320.0, method: 'EFT', date: '2026-08-27' },
  { id: 't4', type: 'sale', product: 'Chips', quantity: 6, amount: 72.0, method: 'Cash', date: '2026-08-28' },
  { id: 't5', type: 'sale', product: 'Coca-Cola 500ml', quantity: 8, amount: 120.0, method: 'Cash', date: '2026-08-29' },
  { id: 't6', type: 'expense', product: 'Electricity', quantity: 1, amount: 180.0, method: 'EFT', date: '2026-08-30' },
];

const DEFAULT_SERVICES = [];

const DEFAULT_SUBSCRIPTION = {
  plan: 'Free',
  planId: 'free',
  billingCycle: null,
  status: 'active',
  paymentMethod: null,
  startedOn: null,
  renewsOn: null,
};

const defaultState = {
  user: null,
  users: [],
  business: null,
  products: DEFAULT_PRODUCTS,
  services: DEFAULT_SERVICES,
  customers: [],
  upcomingWork: [],
  transactions: DEFAULT_TRANSACTIONS,
  subscription: DEFAULT_SUBSCRIPTION,
};

export function AppProvider({ children }) {
  const [state, setState] = useState(defaultState);
  const [isReady, setIsReady] = useState(false);
  const hasLoaded = useRef(false);

  // Load persisted state once on mount.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const loaded = JSON.parse(raw);
          setState((s) => ({
            ...s,
            ...loaded,
            services: loaded.services || s.services,
            customers: loaded.customers || s.customers,
            upcomingWork: loaded.upcomingWork || s.upcomingWork,
            subscription: loaded.subscription || s.subscription,
          }));
        }
      } catch (e) {
        // ignore corrupted storage, fall back to defaults
      } finally {
        hasLoaded.current = true;
        setIsReady(true);
      }
    })();
  }, []);


  
  useEffect(() => {
    if (!hasLoaded.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  const api = useMemo(() => {
    return {
      state,
      isReady,

      register: ({ fullName, phone, email, password, confirmPassword }) => {
        const identifier = (email || phone || '').trim().toLowerCase();

        if (!fullName?.trim() || !identifier || !password) {
          return { ok: false, error: 'Please fill in all fields.' };
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
          return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
        }
        if (password !== confirmPassword) {
          return { ok: false, error: 'Passwords do not match.' };
        }

        const exists = state.users.some(
          (u) => u.identifier === identifier || (email && u.email === email.trim().toLowerCase())
        );
        if (exists) {
          return { ok: false, error: 'An account with this phone number or email already exists. Try logging in instead.' };
        }

        const newUser = {
          name: fullName.trim(),
          identifier,
          phone: phone?.trim() || '',
          email: email?.trim().toLowerCase() || '',
          password, // demo-only plaintext storage — see README
        };

        setState((s) => ({
          ...s,
          users: [...s.users, newUser],
          user: { name: newUser.name, identifier: newUser.identifier },
          business: null,
          products: DEFAULT_PRODUCTS,
          services: DEFAULT_SERVICES,
          customers: [],
          upcomingWork: [],
          transactions: DEFAULT_TRANSACTIONS,
          subscription: DEFAULT_SUBSCRIPTION,
        }));
        return { ok: true };
      },

      login: ({ identifier, password }) => {
        const clean = (identifier || '').trim().toLowerCase();
        if (!clean || !password) {
          return { ok: false, error: 'Please enter your phone/email and password.' };
        }

        const account = state.users.find((u) => u.identifier === clean || u.email === clean || u.phone === clean);
        if (!account) {
          return { ok: false, error: 'No account found with those details. Please register first.' };
        }
        if (account.password !== password) {
          return { ok: false, error: 'Incorrect password. Please try again.' };
        }

        setState((s) => ({ ...s, user: { name: account.name, identifier: account.identifier } }));
        return { ok: true };
      },

      loginWithGoogle: () => {
        if (!state.users.length) {
          return { ok: false, error: 'No account found yet. Please register first.' };
        }
        const account = state.users[0];
        setState((s) => ({ ...s, user: { name: account.name, identifier: account.identifier } }));
        return { ok: true };
      },

      logout: () => setState((s) => ({ ...s, user: null })),

      updateUserProfile: (profile) =>
        setState((s) => {
          if (!s.user) return s;
          const nextUser = { ...s.user, ...profile };
          return {
            ...s,
            user: nextUser,
            users: s.users.map((account) =>
              account.identifier === s.user.identifier
                ? {
                    ...account,
                    identifier: nextUser.identifier,
                    name: nextUser.name,
                    phone: nextUser.phone || account.phone,
                    email: nextUser.email || account.email,
                  }
                : account
            ),
          };
        }),

      saveBusiness: (business) => setState((s) => ({ ...s, business })),

      addService: (service) =>
        setState((s) => ({ ...s, services: [...s.services, { ...service, id: `s_${Date.now()}` }] })),

      updateService: (serviceId, service) =>
        setState((s) => ({
          ...s,
          services: s.services.map((item) => (item.id === serviceId ? { ...item, ...service } : item)),
        })),

      deleteService: (serviceId) =>
        setState((s) => ({ ...s, services: s.services.filter((service) => service.id !== serviceId) })),

      addCustomer: (customer) =>
        setState((s) => ({ ...s, customers: [...s.customers, { ...customer, id: `c_${Date.now()}` }] })),

      updateCustomer: (customerId, customer) =>
        setState((s) => ({
          ...s,
          customers: s.customers.map((item) => (item.id === customerId ? { ...item, ...customer } : item)),
        })),

      deleteCustomer: (customerId) =>
        setState((s) => ({
          ...s,
          customers: s.customers.filter((customer) => customer.id !== customerId),
          upcomingWork: s.upcomingWork.map((work) => (work.customerId === customerId ? { ...work, customerId: '' } : work)),
        })),

      addUpcomingWork: (work) =>
        setState((s) => ({ ...s, upcomingWork: [...s.upcomingWork, { ...work, id: `w_${Date.now()}` }] })),

      updateUpcomingWork: (workId, work) =>
        setState((s) => ({
          ...s,
          upcomingWork: s.upcomingWork.map((item) => (item.id === workId ? { ...item, ...work } : item)),
        })),

      deleteUpcomingWork: (workId) =>
        setState((s) => ({ ...s, upcomingWork: s.upcomingWork.filter((work) => work.id !== workId) })),

      addTransaction: (txn) =>
        setState((s) => {
          const next = { ...txn, id: `t_${Date.now()}` };
          const products = [...s.products];

          if (txn.type === 'sale') {
            const idx = products.findIndex((p) => p.name === txn.product);
            if (idx >= 0) {
              products[idx] = { ...products[idx], stock: Math.max(0, products[idx].stock - Number(txn.quantity || 0)) };
            }
          }
          if (txn.type === 'stock_purchase') {
            const idx = products.findIndex((p) => p.name === txn.product);
            if (idx >= 0) {
              products[idx] = { ...products[idx], stock: products[idx].stock + Number(txn.quantity || 0) };
            }
          }

          return { ...s, transactions: [next, ...s.transactions], products };
        }),

      addStock: ({ product, quantity, amount }) =>
        setState((s) => {
          const cleanName = product.trim();
          const stockQuantity = Number(quantity || 0);
          const stockAmount = Number(amount || 0);
          const existingIndex = s.products.findIndex((item) => item.name.toLowerCase() === cleanName.toLowerCase());
          const products = [...s.products];

          if (existingIndex >= 0) {
            const existing = products[existingIndex];
            products[existingIndex] = {
              ...existing,
              stock: existing.stock + stockQuantity,
              cost: stockQuantity ? stockAmount / stockQuantity : existing.cost,
            };
          } else {
            products.push({
              id: `p_${Date.now()}`,
              name: cleanName,
              category: 'Other',
              stock: stockQuantity,
              lowStockThreshold: 5,
              price: stockQuantity ? (stockAmount / stockQuantity) * 1.25 : 0,
              cost: stockQuantity ? stockAmount / stockQuantity : 0,
            });
          }

          return {
            ...s,
            products,
            transactions: [
              {
                id: `t_${Date.now()}`,
                type: 'stock_purchase',
                product: cleanName,
                quantity: stockQuantity,
                amount: stockAmount,
                date: new Date().toISOString().slice(0, 10),
              },
              ...s.transactions,
            ],
          };
        }),

      deleteProduct: (productId) =>
        setState((s) => ({ ...s, products: s.products.filter((product) => product.id !== productId) })),

      updateProductPrice: (productId, price) =>
        setState((s) => ({
          ...s,
          products: s.products.map((p) => (p.id === productId ? { ...p, price } : p)),
        })),

      // `card` here is the transient form values ({ brand, number, name, expiry }).
      // Only a masked summary is ever written to state/storage — never the
      // full card number or CVV.
      subscribe: ({ planId, planName, billingCycle, card }) =>
        setState((s) => {
          const today = new Date().toISOString().slice(0, 10);
          const paymentMethod = card
            ? {
                brand: card.brand,
                last4: card.last4,
                expiry: card.expiry,
                cardholderName: card.cardholderName,
              }
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
  }, [state, isReady]);

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
