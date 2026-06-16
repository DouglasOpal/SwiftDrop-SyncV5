// src/services/api.js — axios instance with token injection + auto-refresh on 401
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { getAccess, getRefresh, saveTokens, clearAll } from '../utils/storage';

export const api = axios.create({ baseURL: API_BASE_URL, timeout: 20000 });

// What kind of account is signed in — set by AuthContext so refresh hits the right endpoint.
let accountType = 'user';                 // 'user' | 'rider' | 'admin'
export const setAccountType = (t) => { accountType = t || 'user'; };

let onLogout = () => {};
export const setLogoutHandler = (fn) => { onLogout = fn || (() => {}); };

api.interceptors.request.use(async (cfg) => {
  const token = await getAccess();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

let refreshing = null;
async function refreshTokens() {
  const refreshToken = await getRefresh();
  if (!refreshToken) throw new Error('no_refresh');
  const path = accountType === 'rider' ? '/auth/rider/refresh'
            : accountType === 'admin' ? '/admin/refresh'
            : '/auth/user/refresh';
  const { data } = await axios.post(`${API_BASE_URL}${path}`, { refreshToken });
  await saveTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        refreshing = refreshing || refreshTokens();
        const newToken = await refreshing;
        refreshing = null;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (e) {
        refreshing = null;
        await clearAll();
        onLogout();
      }
    }
    return Promise.reject(error);
  }
);

// Normalise error messages coming back from the API
export function errMsg(e, fallback = 'Something went wrong. Please try again.') {
  return e?.response?.data?.message || e?.message || fallback;
}
