// src/components/MapPanel.js — react-native-maps wrapper with a safe web fallback.
import React from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';
import { colors, font, radius } from '../theme';
import { DEFAULT_REGION } from '../config';

let MapView, Marker, Polyline, PROVIDER_DEFAULT;
if (Platform.OS !== 'web') {
  try {
    const Maps = require('react-native-maps');
    MapView = Maps.default; Marker = Maps.Marker; Polyline = Maps.Polyline; PROVIDER_DEFAULT = Maps.PROVIDER_DEFAULT;
  } catch (e) { /* maps not available */ }
}

/**
 * markers: [{ id, lat, lng, title, color }]
 * route:   [{ lat, lng }, ...] (optional polyline)
 * onPress(coordinate) — tap-to-place handler (optional)
 */
export default function MapPanel({ region, markers = [], route, onPress, height = 260, style, mapRef }) {
  const initial = region || DEFAULT_REGION;

  if (!MapView) {
    return (
      <View style={[styles.fallback, { height }, style]}>
        <Text style={styles.fallTitle}>🗺️  Map preview</Text>
        <Text style={styles.fallSub}>Live map renders on a device / emulator (Expo Go).</Text>
        {markers.map((m) => (
          <Text key={m.id} style={styles.fallPin}>📍 {m.title || `${m.lat?.toFixed?.(4)}, ${m.lng?.toFixed?.(4)}`}</Text>
        ))}
      </View>
    );
  }

  return (
    <View style={[{ height, borderRadius: radius.lg, overflow: 'hidden' }, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        initialRegion={initial}
        region={region}
        showsUserLocation
        onPress={(e) => onPress && onPress(e.nativeEvent.coordinate)}
      >
        {markers.map((m) => (
          <Marker key={m.id} coordinate={{ latitude: m.lat, longitude: m.lng }} title={m.title} pinColor={m.color || colors.primary} />
        ))}
        {route && route.length > 1 && (
          <Polyline coordinates={route.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={colors.primary} strokeWidth={4} />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', padding: 16 },
  fallTitle: { fontFamily: font.semi, color: colors.text, fontSize: 16 },
  fallSub: { fontFamily: font.regular, color: colors.textDim, fontSize: 12, marginTop: 4, textAlign: 'center' },
  fallPin: { fontFamily: font.regular, color: colors.text, fontSize: 13, marginTop: 8 },
});
