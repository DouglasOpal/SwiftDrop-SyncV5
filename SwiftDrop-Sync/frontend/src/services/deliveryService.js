// src/services/deliveryService.js
import { api } from './api';

export const deliveryService = {
  quote:        (body) => api.post('/deliveries/quote', body),
  create:       (body) => api.post('/deliveries', body),
  assignRider:  (id) => api.post(`/deliveries/${id}/assign-rider`),
  get:          (id) => api.get(`/deliveries/${id}`),
  mine:         (params) => api.get('/deliveries/my', { params }),
  track:        (code) => api.get(`/deliveries/track/${code}`),
  trackRider:   (id) => api.get(`/deliveries/${id}/track-rider`),
  genPickupOtp: (id) => api.post(`/deliveries/${id}/pickup-otp/generate`),
  rate:         (id, body) => api.post(`/deliveries/${id}/rate`, body),

  // rider side
  available:    () => api.get('/deliveries/available'),
  accept:       (id) => api.post(`/deliveries/${id}/accept`),
  pushLocation: (id, lat, lng, heading) => api.patch(`/deliveries/${id}/location`, { lat, lng, heading }),
  verifyPickup: (id, code) => api.post(`/deliveries/${id}/pickup-otp/verify`, { code }),
  setStatus:    (id, status, reason) => api.patch(`/deliveries/${id}/status`, { status, reason }),
};
