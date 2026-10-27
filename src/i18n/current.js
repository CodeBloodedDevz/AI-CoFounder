// The language currently in use, readable from anywhere (including code outside React, such as the
// data layer that builds error messages). The I18nProvider keeps it up to date.
import { translatorFor } from './index';
import { DEFAULT_LANGUAGE } from './languages';

let current = DEFAULT_LANGUAGE;
const listeners = new Set();

export const getLanguage = () => current;
export function setCurrentLanguage(name) {
  if (name && name !== current) {
    current = name;
    listeners.forEach((fn) => fn(current));
  }
}
export function subscribeLanguage(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Translate right now, in whatever language is active. Prefer useTranslation().t inside components. */
export const tr = (key, params) => translatorFor(current)(key, params);

// The business's currency symbol ("R", "$", "€"...), for text built outside React (AI insights).
// The I18nProvider keeps it in step with the saved business currency.
let currencySymbol = 'R';
export const getCurrencySymbol = () => currencySymbol;
export function setCurrencySymbol(symbol) {
  if (symbol) currencySymbol = String(symbol);
}
/** Whole-unit amount with the business's symbol: money(1250.4) -> "R1250". */
export const money = (n) => `${Number(n) < 0 ? '-' : ''}${currencySymbol}${Math.abs(Number(n) || 0).toFixed(0)}`;
