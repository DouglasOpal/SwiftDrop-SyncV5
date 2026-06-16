// src/utils/storage.js — secure token + session persistence
import * as SecureStore from 'expo-secure-store';
const KEYS = { access: 'sd_access', refresh: 'sd_refresh', session: 'sd_session' };
export async function saveTokens(access, refresh) {
  if (access)  await SecureStore.setItemAsync(KEYS.access, access);
  if (refresh) await SecureStore.setItemAsync(KEYS.refresh, refresh);
}
export const getAccess  = () => SecureStore.getItemAsync(KEYS.access);
export const getRefresh = () => SecureStore.getItemAsync(KEYS.refresh);
export async function saveSession(session) { await SecureStore.setItemAsync(KEYS.session, JSON.stringify(session || {})); }
export async function getSession() {
  const raw = await SecureStore.getItemAsync(KEYS.session);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export async function clearAll() { await Promise.all(Object.values(KEYS).map((k) => SecureStore.deleteItemAsync(k))); }
