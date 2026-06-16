// src/config.js — central runtime configuration
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// ─────────────────────────────────────────────────────────────────────────────
// API base URL
// ─────────────────────────────────────────────────────────────────────────────
// Backend port (see backend/.env → PORT)
const PORT = 5000;

// Manual override: if auto-detection ever fails, hardcode your machine's LAN IP
// here, e.g. 'http://192.168.1.20:5000'. Leave null to auto-detect.
const API_OVERRIDE = null;

// When running in Expo Go / dev, the app is served from your computer's LAN IP.
// We reuse that exact IP for the API so a physical phone can reach the backend
// without any manual configuration. Falls back to emulator/simulator defaults.
function devHostIp() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest?.debuggerHost ||           // legacy SDKs
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    '';
  const ip = String(hostUri).split(':')[0];
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : null;
}

function resolveHost() {
  if (API_OVERRIDE) return API_OVERRIDE;
  const ip = devHostIp();
  if (ip) return `http://${ip}:${PORT}`;           // physical device or LAN
  return Platform.select({
    android: `http://10.0.2.2:${PORT}`,            // Android emulator loopback
    ios:     `http://localhost:${PORT}`,           // iOS simulator
    default: `http://localhost:${PORT}`,
  });
}

export const API_BASE_URL = `${resolveHost()}/api/v1`;

// Default map region (Lagos) used until we have the device location.
export const DEFAULT_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

// Polling cadence (ms) for live sync.
export const POLL = {
  findingRider: 4000,   // user waiting for a rider
  tracking:     5000,   // user tracking rider on map
  riderFeed:    6000,   // rider polling for new jobs
  locationPush: 8000,   // rider pushing location heartbeat
};
