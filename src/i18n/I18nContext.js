import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../context/AppContext';
import { translatorFor, languageStatuses } from './index';
import { DEFAULT_LANGUAGE, languageInfo, resolveLanguage, languageDisplayName } from './languages';
import { setCurrentLanguage, setCurrencySymbol } from './current';
import { formatDate, formatDateTime, formatMoney, formatNumber, formatTime, currencySymbol } from './format';

const I18nContext = createContext(null);
const STORAGE_KEY = 'ai-cofounder-language-v1';

// Which language is shown, and where that choice lives:
//   * on this device (AsyncStorage / browser storage): so the login screens and the very first paint after a
//     refresh or reopening Expo Go already use it;
//   * on the account (business.language, saved by the backend): so it follows the person to another phone
//     or browser. Once a person is signed in and has a saved language, the account wins.
// Choosing a language changes every screen at once and is then saved to both places.
export function I18nProvider({ children }) {
  const { state, saveBusiness } = useApp();
  const [language, setLanguageState] = useState(DEFAULT_LANGUAGE);
  const loaded = useRef(false);

  const apply = useCallback((name, { persist = true } = {}) => {
    const resolved = resolveLanguage(name);
    if (!resolved) return null;
    setCurrentLanguage(resolved); // for code outside React (error messages, AI requests)
    setLanguageState(resolved);
    if (persist) AsyncStorage.setItem(STORAGE_KEY, resolved).catch(() => {});
    return resolved;
  }, []);

  // 1. What this device used last time.
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        // A language that is no longer offered (only English, Afrikaans and isiZulu are) is forgotten.
        if (saved && !apply(saved, { persist: false })) AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      } catch (e) {
        // no storage: the account language (below) or English is used
      } finally {
        loaded.current = true;
      }
    })();
  }, [apply]);

  // 2. The signed-in person's saved language wins (and is remembered on the device for next time).
  const accountLanguage = state.user ? resolveLanguage(state.business?.language) : null;
  useEffect(() => {
    if (accountLanguage) apply(accountLanguage);
  }, [accountLanguage, apply]);

  // Change the language everywhere, immediately. sync=false is for the first-time setup form, where the
  // business does not exist yet: the choice is saved together with the rest of the form on "Finish setup".
  const setLanguage = useCallback(
    async (name, { sync = true } = {}) => {
      const resolved = apply(name);
      if (!resolved) return { ok: false };
      if (sync && state.user && state.business) {
        const r = await saveBusiness({ language: resolved }); // partial update: nothing else is touched
        return r?.ok ? { ok: true } : { ok: false, error: r?.error };
      }
      return { ok: true };
    },
    [apply, saveBusiness, state.user, state.business]
  );

  // Keep the symbol used by text built outside React (AI insights) in step with the business.
  const businessSymbol = currencySymbol(state.business?.currency);
  setCurrencySymbol(businessSymbol);

  const value = useMemo(() => {
    const info = languageInfo(language);
    const symbol = businessSymbol;
    const t = translatorFor(language);
    const statuses = languageStatuses();
    return {
      language,
      languageCode: info.code,
      locale: info.locale,
      t,
      // Stored values stay as they are in the database; this only translates how they are shown.
      //   tv('workStatus', 'Pending') -> "Kuyalindwa"; unknown values are shown unchanged.
      tv: (group, value) => {
        const key = `${group}.${String(value).replace(/[^A-Za-z0-9]+/g, '_')}`;
        return t.has(key) ? t(key) : String(value ?? '');
      },
      languageLabel: (name) => {
        const s = statuses.find((l) => l.name === name);
        const label = languageDisplayName(name);
        return s && !s.complete ? `${label} (${t('settings.partial')})` : label;
      },
      setLanguage,
      languages: statuses,
      formatNumber: (n, options) => formatNumber(n, language, options),
      formatMoney: (n, options) => formatMoney(n, language, { symbol, ...options }),
      formatDate: (d, options) => formatDate(d, language, options),
      formatDateTime: (d, options) => formatDateTime(d, language, options),
      formatTime,
      currencySymbol: symbol,
    };
  }, [language, setLanguage, businessSymbol]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Outside a provider (isolated component tests, storybook-style previews) everything is simply English.
const FALLBACK = {
  language: DEFAULT_LANGUAGE,
  languageCode: 'en',
  locale: 'en-ZA',
  t: translatorFor(DEFAULT_LANGUAGE),
  tv: (group, value) => String(value ?? ''),
  languageLabel: (name) => languageDisplayName(name),
  setLanguage: async () => ({ ok: false }),
  languages: [],
  formatNumber: (n, options) => formatNumber(n, DEFAULT_LANGUAGE, options),
  formatMoney: (n, options) => formatMoney(n, DEFAULT_LANGUAGE, options),
  formatDate: (d, options) => formatDate(d, DEFAULT_LANGUAGE, options),
  formatDateTime: (d, options) => formatDateTime(d, DEFAULT_LANGUAGE, options),
  formatTime,
  currencySymbol: 'R',
};

export function useTranslation() {
  return useContext(I18nContext) || FALLBACK;
}
