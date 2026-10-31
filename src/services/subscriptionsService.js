// src/services/subscriptionsService.js — plans, subscriptions and Paystack payments.
import { apiFetch } from './api.js';

export const subscriptionsService = {
  getPlans: () => apiFetch('/admin/subscriptions/plans'),
  getSubscriptions: (params = {}) => apiFetch('/admin/subscriptions', { query: params }),
  getPayments: (params = {}) => apiFetch('/admin/payments', { query: params }),
  getPaymentSummary: () => apiFetch('/admin/payments/summary'),
  /** Asks Paystack again about a payment (never activates a plan Paystack hasn't confirmed). */
  verifyPayment: (reference) => apiFetch(`/admin/payments/${encodeURIComponent(reference)}/verify`, { method: 'POST' }),
};
