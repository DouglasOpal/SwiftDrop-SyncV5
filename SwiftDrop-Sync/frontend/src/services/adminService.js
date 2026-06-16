// src/services/adminService.js
import { api } from './api';

export const adminService = {
  dashboard:     () => api.get('/admin/dashboard'),
  analytics:     (period = 30) => api.get('/admin/analytics', { params: { period } }),
  riders:        (params) => api.get('/admin/riders', { params }),
  riderHistory:  (riderId, params) => api.get(`/admin/riders/${riderId}/deliveries`, { params }),
  deliveries:    (params) => api.get('/admin/deliveries', { params }),
};
