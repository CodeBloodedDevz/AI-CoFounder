// src/services/authService.js
// Admin sign-in uses the same Supabase Auth accounts as the app; the backend only lets in
// accounts listed in admin_users (add one with `npm run admin:add` in the backend folder).
import { apiFetch, session } from './api.js';

export const authService = {
  /** { email, password, remember } -> { token, admin } */
  async login({ email, password, remember }) {
    const data = await apiFetch('/auth/admin/login', { method: 'POST', body: { email, password } });
    session.set(data, remember);
    return data;
  },

  async logout() {
    // Tell the backend first, while the token can still be sent.
    await apiFetch('/auth/admin/logout', { method: 'POST' }).catch(() => {});
    session.clear();
  },

  /** The signed-in admin, checked by the backend; null when there is no session. */
  async getCurrentAdmin() {
    if (!session.get()) return null;
    const admin = await apiFetch('/auth/admin/me');
    session.update({ admin });
    return admin;
  },

  async updateProfile(name) {
    const admin = await apiFetch('/auth/admin/profile', { method: 'PATCH', body: { name } });
    session.update({ admin });
    return admin;
  },

  changePassword(currentPassword, newPassword) {
    return apiFetch('/auth/admin/password', { method: 'POST', body: { currentPassword, newPassword } });
  },

  getPreferences() {
    return apiFetch('/auth/admin/preferences');
  },

  savePreferences(prefs) {
    return apiFetch('/auth/admin/preferences', { method: 'PUT', body: prefs });
  },

  isAuthenticated() {
    return Boolean(session.get()?.token);
  },
};
