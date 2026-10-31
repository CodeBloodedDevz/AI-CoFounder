// src/services/monitoringService.js — live backend, database, AI and payment status.
import { apiFetch } from './api.js';

export const monitoringService = {
  getStatus: () => apiFetch('/admin/monitoring/status'),
};
