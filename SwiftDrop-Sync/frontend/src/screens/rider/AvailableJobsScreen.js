// src/screens/rider/AvailableJobsScreen.js
// FEATURES 1 & 3 — proper user↔rider sync: live feed of open jobs the rider can accept.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { H1, P, Button, Card, Loader } from '../../components/ui';
import { deliveryService } from '../../services/deliveryService';
import { errMsg } from '../../services/api';
import { POLL } from '../../config';
import { colors, font, radius, space, naira } from '../../theme';

export default function AvailableJobsScreen({ navigation }) {
  const [jobs, setJobs] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting]   = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try { const { data } = await deliveryService.available(); setJobs(data.data || []); }
    catch { setJobs([]); }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    pollRef.current = setInterval(load, POLL.riderFeed);
    return () => pollRef.current && clearInterval(pollRef.current);
  }, [load]));

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  async function accept(job) {
    setAccepting(job.id);
    try {
      const { data } = await deliveryService.accept(job.id);
      navigation.navigate('Dashboard', { screen: 'ActiveDelivery', params: { deliveryId: data.delivery.id } });
    } catch (e) {
      if (e?.response?.status === 409) { Alert.alert('Just missed it', 'Another rider grabbed this job. Refreshing your feed.'); load(); }
      else Alert.alert('Could not accept', errMsg(e));
    } finally { setAccepting(null); }
  }

  if (jobs === null) return <Loader label="Loading nearby jobs…" />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.lg }}
      data={jobs}
      keyExtractor={(j) => j.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={{ marginBottom: space.md }}>
          <H1>Available jobs</H1>
          <P dim>Go online from your dashboard to keep this list fresh.</P>
        </View>
      }
      ListEmptyComponent={<P dim>No open jobs near you right now. New requests will appear automatically.</P>}
      renderItem={({ item }) => (
        <Card style={{ marginBottom: space.md }}>
          <View style={st.top}>
            <Text style={st.earn}>{item.earningText || naira(item.earning)}</Text>
            {item.distanceToPickup != null && <Text style={st.dist}>{item.distanceToPickup.toFixed?.(1)} km to pickup</Text>}
          </View>
          <Row glyph="🟢" label="Pickup" value={item.pickup?.address} />
          <Row glyph="🔴" label="Drop-off" value={item.dropoff?.address} />
          {item.parcel?.size && <Text style={st.parcel}>📦 {item.parcel.size}{item.distanceKm ? ` · ${item.distanceKm} km trip` : ''}</Text>}
          <Button title="Accept job" onPress={() => accept(item)} loading={accepting === item.id} style={{ marginTop: space.sm }} />
        </Card>
      )}
    />
  );
}

function Row({ glyph, label, value }) {
  return (
    <View style={st.row}>
      <Text style={st.glyph}>{glyph}</Text>
      <View style={{ flex: 1 }}>
        <Text style={st.label}>{label}</Text>
        <Text style={st.value} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  top:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  earn:   { color: colors.primary, fontFamily: font.displayX, fontSize: 22 },
  dist:   { color: colors.textDim, fontFamily: font.medium, fontSize: 12 },
  row:    { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  glyph:  { fontSize: 13, marginRight: space.sm },
  label:  { color: colors.textDim, fontFamily: font.regular, fontSize: 11 },
  value:  { color: colors.text, fontFamily: font.medium, fontSize: 14 },
  parcel: { color: colors.textDim, fontFamily: font.regular, fontSize: 13, marginTop: space.sm },
});
