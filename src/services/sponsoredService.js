// src/services/sponsoredService.js — Sponsored adverts: review queue, decisions, packages, payments, figures.
import { apiFetch } from './api.js';

const enc = encodeURIComponent;

export const sponsoredService = {
  getSummary: () => apiFetch('/admin/sponsored/summary'),
  /** status: review | changes | active | scheduled | expired | awaiting_payment | rejected | suspended | removed | withdrawn */
  listAds: (params = {}) => apiFetch('/admin/sponsored/ads', { query: params }),
  getAd: (id) => apiFetch(`/admin/sponsored/ads/${enc(id)}`),
  /** action: approve | reject | suspend | reinstate | remove | changes/approve | changes/reject */
  adAction: (id, action, body = {}) => apiFetch(`/admin/sponsored/ads/${enc(id)}/${action}`, { method: 'POST', body }),

  listProfiles: (params = {}) => apiFetch('/admin/sponsored/profiles', { query: params }),
  /** decision: approve | reject */
  decideProfile: (businessId, decision, body = {}) => apiFetch(`/admin/sponsored/profiles/${enc(businessId)}/${decision}`, { method: 'POST', body }),

  listReports: (params = {}) => apiFetch('/admin/sponsored/reports', { query: params }),
  /** decision: dismiss | actioned */
  decideReport: (id, decision) => apiFetch(`/admin/sponsored/reports/${enc(id)}/${decision}`, { method: 'POST' }),

  getPackages: () => apiFetch('/admin/sponsored/packages'),
  updatePackage: (id, fields) => apiFetch(`/admin/sponsored/packages/${enc(id)}`, { method: 'PUT', body: fields }),

  listOrders: (params = {}) => apiFetch('/admin/sponsored/orders', { query: params }),
  verifyOrder: (reference) => apiFetch(`/admin/sponsored/orders/${enc(reference)}/verify`, { method: 'POST' }),
  markRefunded: (reference) => apiFetch(`/admin/sponsored/orders/${enc(reference)}/refunded`, { method: 'POST' }),
};
