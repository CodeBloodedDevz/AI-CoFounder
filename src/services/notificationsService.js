// src/services/notificationsService.js — the bell: real events from the last 14 days.
import { apiFetch } from './api.js';

export const notificationsService = {
  list: () => apiFetch('/admin/notifications'),
  markSeen: () => apiFetch('/admin/notifications/seen', { method: 'POST' }),
  search: (q) => apiFetch('/admin/search', { query: { q } }),
};
