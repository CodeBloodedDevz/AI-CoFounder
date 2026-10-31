// src/utils/format.js — consistent number / money / date display across the portal.

export const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-ZA'));

/** money(1250.5) -> "R 1 250.50"; whole amounts have no decimals. */
export function money(n, symbol = 'R') {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const digits = Number.isInteger(v) ? 0 : 2;
  return `${symbol} ${v.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`;
}

export function dateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

/** "5m ago", "3h ago", "2d ago", then the date. */
export function timeAgo(value) {
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString('en-ZA', { dateStyle: 'medium' });
}

// How the app labels payment statuses (src/lib/payment.js in the app).
export const PAYMENT_LABEL = {
  success: 'Paid', pending: 'Pending', failed: 'Failed', cancelled: 'Cancelled',
  expired: 'Expired', mismatch: 'Needs review', refunded: 'Refunded',
};
