// src/services/usersService.js — the app's users (Supabase Auth + their business and plan).
import { apiFetch } from './api.js';

export const usersService = {
  getUsers: (params = {}) => apiFetch('/admin/users', { query: params }),
  getUser: (id) => apiFetch(`/admin/users/${id}`),
  /** status: 'active' | 'suspended' (suspending signs the person out of the app). */
  updateUserStatus: (id, status) => apiFetch(`/admin/users/${id}/status`, { method: 'PATCH', body: { status } }),
};
