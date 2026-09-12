import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

const defaultState = {
  user: null,
  users: [],
  business: null,
  products: DEFAULT_PRODUCTS,
  transactions: DEFAULT_TRANSACTIONS,
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
          setState((s) => ({ ...s, ...loaded }));
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

        setState((s) => ({ ...s, users: [...s.users, newUser], user: { name: newUser.name, identifier: newUser.identifier } }));
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

      saveBusiness: (business) => setState((s) => ({ ...s, business })),

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

      updateProductPrice: (productId, price) =>
        setState((s) => ({
          ...s,
          products: s.products.map((p) => (p.id === productId ? { ...p, price } : p)),
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
