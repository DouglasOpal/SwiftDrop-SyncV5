// src/services/riderService.js — authenticated rider operations
import { api } from './api';

export const riderService = {
  pushLocation:  (lat, lng, heading) => api.patch('/rider/location', { lat, lng, heading }),
  setOnline:     (isOnline) => api.patch('/rider/status', { isOnline }),
  getBank:       () => api.get('/rider/bank'),
  setBank:       (body) => api.put('/rider/bank', body),
  updateProfile: (body) => api.put('/rider/profile', body),
  activeJob:     () => api.get('/rider/active'),
  earnings:      () => api.get('/rider/earnings'),
};
