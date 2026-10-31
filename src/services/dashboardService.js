// src/services/dashboardService.js — figures worked out by the backend from real records.
import { apiFetch } from './api.js';

export const dashboardService = {
  getSummary: (filters = {}) => apiFetch('/admin/dashboard/summary', { query: filters }),
  getRegistrationChart: (filters = {}) => apiFetch('/admin/dashboard/registrations', { query: filters }),
  getRecentUsers: (limit = 5) => apiFetch('/admin/dashboard/recent-users', { query: { limit } }),
  getRecentPayments: (limit = 5) => apiFetch('/admin/dashboard/recent-payments', { query: { limit } }),
};
