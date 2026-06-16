// src/utils/places.js
// Lightweight location search that PRIORITISES results inside the user's radius.
// Combines a built-in Nigerian landmark dataset with the device's reverse-geocode,
// ranking matches by text relevance first, then by distance from the user.
import * as Location from 'expo-location';

// Curated, commonly-searched Lagos/Nigeria locations (extend freely).
const DATASET = [
  { name: 'Ikeja City Mall',         area: 'Ikeja',        lat: 6.6128, lng: 3.3585 },
  { name: 'Computer Village',        area: 'Ikeja',        lat: 6.5921, lng: 3.3420 },
  { name: 'Allen Avenue',            area: 'Ikeja',        lat: 6.5966, lng: 3.3515 },
  { name: 'Murtala Muhammed Airport',area: 'Ikeja',        lat: 6.5774, lng: 3.3210 },
  { name: 'Lekki Phase 1',           area: 'Lekki',        lat: 6.4474, lng: 3.4699 },
  { name: 'Admiralty Way',           area: 'Lekki',        lat: 6.4430, lng: 3.4730 },
  { name: 'Circle Mall',             area: 'Lekki',        lat: 6.4456, lng: 3.5530 },
  { name: 'Victoria Island',         area: 'VI',           lat: 6.4281, lng: 3.4219 },
  { name: 'Eko Hotel',               area: 'VI',           lat: 6.4318, lng: 3.4255 },
  { name: 'Tafawa Balewa Square',    area: 'Lagos Island', lat: 6.4498, lng: 3.3930 },
  { name: 'Balogun Market',          area: 'Lagos Island', lat: 6.4560, lng: 3.3900 },
  { name: 'Yaba Market',             area: 'Yaba',         lat: 6.5095, lng: 3.3711 },
  { name: 'University of Lagos',     area: 'Akoka',        lat: 6.5158, lng: 3.3966 },
  { name: 'National Stadium',        area: 'Surulere',     lat: 6.4969, lng: 3.3540 },
  { name: 'Adeniran Ogunsanya Mall', area: 'Surulere',     lat: 6.4938, lng: 3.3560 },
  { name: 'Oshodi Interchange',      area: 'Oshodi',       lat: 6.5550, lng: 3.3410 },
  { name: 'Festac Town',             area: 'Festac',       lat: 6.4660, lng: 3.2840 },
  { name: 'Apapa Wharf',             area: 'Apapa',        lat: 6.4490, lng: 3.3640 },
  { name: 'Mile 2',                  area: 'Amuwo',        lat: 6.4640, lng: 3.3120 },
  { name: 'Ojota Bus Stop',          area: 'Ojota',        lat: 6.5790, lng: 3.3840 },
];

export function haversine(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v == null)) return null;
  const R = 6371, dL = (lat2 - lat1) * Math.PI / 180, dl = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dL/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function getCurrentLocation() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

export async function reverseGeocode(lat, lng) {
  try {
    const [g] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!g) return null;
    const parts = [g.name, g.street, g.district, g.city].filter(Boolean);
    return { name: parts.slice(0, 2).join(', ') || 'Pinned location', area: g.city || g.region || '', lat, lng };
  } catch { return null; }
}

/**
 * Search the dataset, ranking by:
 *   1. text match quality (prefix > substring)
 *   2. proximity to the user (closer = higher) — the radius-priority requirement
 * Results outside `radiusKm` are de-prioritised but still shown if the query matches.
 */
export function searchPlaces(query, userLoc, radiusKm = 15) {
  const q = (query || '').trim().toLowerCase();
  const scored = DATASET.map((p) => {
    const hay = `${p.name} ${p.area}`.toLowerCase();
    let textScore = 0;
    if (q) {
      if (hay.startsWith(q)) textScore = 3;
      else if (p.name.toLowerCase().startsWith(q)) textScore = 3;
      else if (hay.includes(q)) textScore = 2;
      else { const tokens = q.split(/\s+/); textScore = tokens.every((t) => hay.includes(t)) ? 1 : 0; }
    } else { textScore = 1; }
    const dist = userLoc ? haversine(userLoc.lat, userLoc.lng, p.lat, p.lng) : null;
    const inRadius = dist != null ? dist <= radiusKm : true;
    return { ...p, distanceKm: dist, inRadius, textScore };
  }).filter((p) => p.textScore > 0);

  scored.sort((a, b) => {
    if (a.inRadius !== b.inRadius) return a.inRadius ? -1 : 1;   // radius priority
    if (b.textScore !== a.textScore) return b.textScore - a.textScore;
    if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
    return 0;
  });
  return scored.slice(0, 8);
}
