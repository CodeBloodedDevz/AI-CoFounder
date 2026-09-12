import { createContext, useContext, useMemo } from 'react';
import { TRANSLATIONS } from './translations';
import { useApp } from '../context/AppContext';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const { state } = useApp();

  const language = state.user ? state.business?.language || 'English' : 'English';

  const value = useMemo(() => {
    const dict = TRANSLATIONS[language] || TRANSLATIONS.English;
    const fallback = TRANSLATIONS.English;

    const t = (key) => dict[key] ?? fallback[key] ?? key;

    return { language, t };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used inside <I18nProvider>');
  return ctx;
}
