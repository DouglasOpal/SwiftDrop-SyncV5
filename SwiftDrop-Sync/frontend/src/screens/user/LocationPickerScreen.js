// src/screens/user/LocationPickerScreen.js
// FEATURE 9 — optimised location search with priority on the user's location radius.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native';
import { Screen, Field, Card, P } from '../../components/ui';
import MapPanel from '../../components/MapPanel';
import { searchPlaces, getCurrentLocation, reverseGeocode } from '../../utils/places';
import { DEFAULT_REGION } from '../../config';
import { colors, font, space } from '../../theme';

export default function LocationPickerScreen({ route, navigation }) {
  const { field, onPick } = route.params || {};
  const [query, setQuery]   = useState('');
  const [userLoc, setUserLoc] = useState(null);
  const [results, setResults] = useState([]);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [pin, setPin]       = useState(null);
  const debRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({ title: field === 'pickup' ? 'Pickup location' : 'Drop-off location' });
    (async () => {
      const loc = await getCurrentLocation();
      if (loc) {
        setUserLoc(loc);
        setRegion({ ...DEFAULT_REGION, latitude: loc.lat, longitude: loc.lng });
      }
      setResults(searchPlaces('', loc, 15)); // nearby suggestions first
    })();
  }, []);

  // Debounced, radius-prioritised search
  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => setResults(searchPlaces(query, userLoc, 15)), 220);
    return () => debRef.current && clearTimeout(debRef.current);
  }, [query, userLoc]);

  function choose(place) {
    const picked = { address: place.name, area: place.area, lat: place.lat, lng: place.lng };
    onPick && onPick(field, picked);
    navigation.goBack();
  }

  async function useCurrent() {
    const loc = userLoc || (await getCurrentLocation());
    if (!loc) return;
    const rev = await reverseGeocode(loc.lat, loc.lng);
    choose(rev || { name: 'My current location', area: '', lat: loc.lat, lng: loc.lng });
  }

  async function onMapTap(coord) {
    const lat = coord.latitude, lng = coord.longitude;
    setPin({ lat, lng });
    setRegion((r) => ({ ...r, latitude: lat, longitude: lng }));
    const rev = await reverseGeocode(lat, lng);
    if (rev) setQuery(rev.name);
  }

  const markers = pin ? [{ id: 'pin', lat: pin.lat, lng: pin.lng, title: 'Selected point' }] : [];

  return (
    <Screen padded={false}>
      <View style={{ padding: space.lg, paddingBottom: space.sm }}>
        <Field label="Search a place" placeholder="e.g. Lekki Phase 1, Ikeja Mall…" value={query} onChangeText={setQuery} autoFocus />
        <Pressable onPress={useCurrent} style={st.current}>
          <Text style={st.currentTxt}>📍  Use my current location</Text>
        </Pressable>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item, i) => `${item.name}-${i}`}
        keyboardShouldPersistTaps="handled"
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: space.lg }}
        ListEmptyComponent={<P dim style={{ paddingHorizontal: space.lg }}>No matches. Try a different name or tap the map below.</P>}
        renderItem={({ item }) => (
          <Card onPress={() => choose(item)} style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={st.name}>{item.name}</Text>
              <Text style={st.area}>
                {item.area}{item.distanceKm != null ? ` · ${item.distanceKm.toFixed(1)} km away` : ''}
                {item.inRadius ? '  • Nearby' : ''}
              </Text>
            </View>
            <Text style={st.go}>›</Text>
          </Card>
        )}
      />

      <View style={{ padding: space.lg }}>
        <Text style={st.mapHint}>Or tap the map to drop a pin</Text>
        <MapPanel region={region} markers={markers} onPress={onMapTap} height={220} />
        {pin && (
          <Pressable onPress={() => choose({ name: query || 'Pinned location', area: '', lat: pin.lat, lng: pin.lng })} style={st.confirmPin}>
            <Text style={st.confirmTxt}>Use this pin</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  current:    { marginTop: space.sm },
  currentTxt: { color: colors.primary, fontFamily: font.semi, fontSize: 14 },
  row:        { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm },
  name:       { color: colors.text, fontFamily: font.semi, fontSize: 15 },
  area:       { color: colors.textDim, fontFamily: font.regular, fontSize: 12, marginTop: 2 },
  go:         { color: colors.textDim, fontSize: 24, marginLeft: space.sm },
  mapHint:    { color: colors.textDim, fontFamily: font.medium, fontSize: 13, marginBottom: space.sm },
  confirmPin: { marginTop: space.md, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  confirmTxt: { color: '#04150B', fontFamily: font.semi, fontSize: 15 },
});
