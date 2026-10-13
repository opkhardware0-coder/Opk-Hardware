// Shared UI helpers: formatting, toasts, escaping.
export const STORE_TZ = 'Africa/Accra';
export const DEFAULT_CURRENCY = 'GHS';

export function formatMoney(value, currency = DEFAULT_CURRENCY) {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat('en-GH', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function formatDateTime(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: STORE_TZ }).format(new Date(iso));
}

/** Start of "today" in Africa/Accra (UTC+0, no DST) as an ISO string. */
export function startOfTodayAccra() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TZ }).format(new Date()); // YYYY-MM-DD
  return `${parts}T00:00:00+00:00`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(message, type = 'info') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}
