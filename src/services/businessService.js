// src/services/businessService.js — one business's records, changed with the app's own rules.
import { apiFetch } from './api.js';

// kind: 'transactions' | 'products' | 'services' | 'customers' | 'bookings'
export const businessService = {
  getOverview: (userId) => apiFetch(`/admin/users/${userId}/overview`),
  updateProfile: (userId, fields) => apiFetch(`/admin/users/${userId}/business`, { method: 'PUT', body: fields }),
  list: (userId, kind, params = {}) => apiFetch(`/admin/users/${userId}/${kind}`, { query: params }),
  update: (userId, kind, id, fields) => apiFetch(`/admin/users/${userId}/${kind}/${id}`, { method: 'PUT', body: fields }),
  remove: (userId, kind, id) => apiFetch(`/admin/users/${userId}/${kind}/${id}`, { method: 'DELETE' }),
  getPayments: (userId) => apiFetch(`/admin/users/${userId}/payments`),
  /** action: 'cancel' (at the end of the paid period) | 'resume' */
  subscription: (userId, action) => apiFetch(`/admin/users/${userId}/subscription/${action}`, { method: 'POST' }),
};
