// src/services/authService.js
import { api } from './api';

export const authService = {
  // ── User ──
  userSendOtp:   (phone, purpose = 'signin') => api.post('/auth/user/send-otp', { phone, userType: 'user', purpose }),
  userVerifyOtp: (phone, code, purpose = 'signin') => api.post('/auth/user/verify-otp', { phone, code, userType: 'user', purpose }),
  userProfile:   (body) => api.put('/auth/user/profile', body),
  userMe:        () => api.get('/auth/user/me'),
  userLogout:    () => api.post('/auth/user/logout'),

  // ── Rider ──
  riderRegister: (body) => api.post('/auth/rider/register', body),
  riderUpload:   (riderId, docType, fileUri, mime) => {
    const form = new FormData();
    form.append('riderId', riderId);
    form.append('document', { uri: fileUri, name: `${docType}.jpg`, type: mime || 'image/jpeg' });
    return api.post(`/auth/rider/documents/${docType}`, form, {
      headers: { 'Content-Type': 'multipart/form-data', 'X-Rider-ID': riderId },
    });
  },
  riderSendOtp:   (phone) => api.post('/auth/rider/send-otp', { phone, userType: 'rider' }),
  riderVerifyOtp: (phone, code) => api.post('/auth/rider/verify-otp', { phone, code, userType: 'rider' }),
  riderKycStatus: () => api.get('/auth/rider/kyc-status'),
  riderMe:        () => api.get('/auth/rider/me'),
  riderLogout:    () => api.post('/auth/rider/logout'),

  // ── Admin ──
  adminLogin: (email, password) => api.post('/admin/login', { email, password }),
};
