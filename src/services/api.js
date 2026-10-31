// src/services/api.js
// The one place that talks to the AI Co-Founder backend's admin API (/admin-api), which runs inside the
// same backend the mobile app uses. It
//   - sends the login token, and quietly renews it with the refresh token when it expires,
//   - keeps the session for this tab only, or on this computer when "Remember me" was ticked,
//   - turns every failure into an Error whose message can be shown as-is.

export const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/admin-api').replace(/\/+$/, '');
const KEY = 'aico_admin_session';

export const session = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || 'null');
    } catch {
      return null;
    }
  },
  set({ token, refreshToken, expiresAt, admin }, remember) {
    this.clear();
    (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify({ token, refreshToken, expiresAt, admin, remember: Boolean(remember) }));
  },
  update(patch) {
    const cur = this.get();
    if (cur) this.set({ ...cur, ...patch }, cur.remember);
  },
  clear() {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
    // Older versions kept the token under these names.
    sessionStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_user');
  },
};

export class ApiError extends Error {
  constructor(message, { status = 0, code = '' } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshing = null;
/** Swaps the refresh token for a new session. Returns the new token, or null. */
async function refreshSession() {
  const cur = session.get();
  if (!cur?.refreshToken) return null;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/auth/admin/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: cur.refreshToken }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        session.set(data, cur.remember);
        return data.token;
      } catch {
        return null;
      } finally {
        setTimeout(() => { refreshing = null; }, 0);
      }
    })();
  }
  return refreshing;
}

function urlFor(path, query) {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== 'all') params.set(k, v);
  });
  const qs = params.toString();
  return `${BASE_URL}${path}${qs ? `?${qs}` : ''}`;
}

/**
 * apiFetch('/admin/users', { query: { page: 2 } })
 * apiFetch('/admin/users/ID/status', { method: 'PATCH', body: { status: 'suspended' } })
 */
export async function apiFetch(path, { method = 'GET', body, query } = {}) {
  const send = (token) =>
    fetch(urlFor(path, query), {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const cur = session.get();
  let token = cur?.token || null;
  // Renew a token that is about to expire before using it.
  if (token && cur.expiresAt && cur.expiresAt - Date.now() < 30_000) token = (await refreshSession()) || token;

  let res;
  try {
    res = await send(token);
    if (res.status === 401 && token) {
      const fresh = await refreshSession();
      if (fresh) res = await send(fresh);
    }
  } catch {
    throw new ApiError(`Cannot reach the backend at ${BASE_URL}. Make sure the AI Co-Founder backend is running (npm run dev in the backend folder).`);
  }

  const data = await res.json().catch(() => null);
  if (res.status === 401 && token) {
    session.clear();
    window.dispatchEvent(new Event('admin-session-expired'));
  }
  if (!res.ok) {
    throw new ApiError(data?.error || data?.message || `Request failed (${res.status}).`, { status: res.status, code: data?.code });
  }
  return data;
}
