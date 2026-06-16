// src/screens/rider/ActiveDeliveryScreen.js
// FEATURE 4 — rider-side live delivery: map, status progression, pickup PIN, location push.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Linking, Alert } from 'react-native';
import { Screen, H2, P, Button, Card, Field, StatusPill } from '../../components/ui';
import MapPanel from '../../components/MapPanel';
import { deliveryService } from '../../services/deliveryService';
import { riderService } from '../../services/riderService';
import { errMsg } from '../../services/api';
import { getCurrentLocation } from '../../utils/places';
import { POLL, DEFAULT_REGION } from '../../config';
import { colors, font, radius, space, naira, statusMeta } from '../../theme';

export default function ActiveDeliveryScreen({ route, navigation }) {
  const paramId = route.params?.deliveryId;
  const [dv, setDv]   = useState(null);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const hbRef = useRef(null);

  const load = useCallback(async () => {
    try {
      let id = paramId;
      let data;
      if (id) { ({ data } = await deliveryService.get(id)); data = data.data; }
      else    { const r = await riderService.activeJob(); data = r.data.data; }
      setDv(data);
      if (data?.pickup?.lat != null) setRegion((reg) => ({ ...reg, latitude: data.pickup.lat, longitude: data.pickup.lng }));
    } catch (e) { setErr(errMsg(e)); }
  }, [paramId]);

  useEffect(() => { load(); }, [load]);

  // push location while the job is active
  useEffect(() => {
    if (!dv?._id) return;
    const active = ['rider_assigned', 'rider_arrived', 'picked_up', 'in_transit'].includes(dv.status);
    async function push() {
      const loc = await getCurrentLocation();
      if (loc) { try { await deliveryService.pushLocation(dv._id, loc.lat, loc.lng); } catch {} }
    }
    if (active) { push(); hbRef.current = setInterval(push, POLL.locationPush); }
    return () => hbRef.current && clearInterval(hbRef.current);
  }, [dv?._id, dv?.status]);

  async function advance(status, reason) {
    setBusy(true); setErr(null);
    try { await deliveryService.setStatus(dv._id, status, reason); await load(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  async function verifyPin() {
    setBusy(true); setErr(null);
    try { await deliveryService.verifyPickup(dv._id, pin.trim()); setPin(''); await load(); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  if (!dv) return <Screen><P dim>Loading delivery…</P>{err && <P style={{ color: colors.danger }}>{err}</P>}</Screen>;

  const markers = [];
  if (dv.pickup?.lat != null)  markers.push({ id: 'p', lat: dv.pickup.lat,  lng: dv.pickup.lng,  title: 'Pickup',  color: colors.accent });
  if (dv.dropoff?.lat != null) markers.push({ id: 'd', lat: dv.dropoff.lat, lng: dv.dropoff.lng, title: 'Drop-off', color: colors.danger });

  const s = dv.status;

  return (
    <Screen scroll padded={false}>
      <MapPanel region={region} markers={markers}
        route={dv.pickup?.lat != null && dv.dropoff?.lat != null ? [{ lat: dv.pickup.lat, lng: dv.pickup.lng }, { lat: dv.dropoff.lat, lng: dv.dropoff.lng }] : null}
        height={280} />

      <View style={{ padding: space.lg }}>
        <View style={st.head}>
          <H2>{statusMeta[s]?.label || s}</H2>
          <StatusPill status={s} />
        </View>
        <Text style={st.earn}>You earn {naira(dv.pricing?.riderEarning)}</Text>

        <Card style={{ marginTop: space.md }}>
          <Leg glyph="🟢" label="Pickup" value={dv.pickup?.address} />
          <Leg glyph="🔴" label="Drop-off" value={dv.dropoff?.address} />
          {dv.sender && (
            <View style={st.contact}>
              <Text style={st.cname}>Sender: {dv.sender.fullName}</Text>
              {dv.sender.phone ? <Text style={st.call} onPress={() => Linking.openURL(`tel:${dv.sender.phone}`)}>📞 Call {dv.sender.phone}</Text> : null}
            </View>
          )}
        </Card>

        {/* Stage actions */}
        {s === 'rider_assigned' && (
          <Button title="I've arrived at pickup" onPress={() => advance('rider_arrived')} loading={busy} style={{ marginTop: space.md }} />
        )}

        {s === 'rider_arrived' && (
          <Card style={{ marginTop: space.md }}>
            <H2>Confirm pickup</H2>
            <P dim style={{ marginBottom: space.sm }}>Ask the sender for their 4-digit pickup PIN.</P>
            <Field label="Pickup PIN" placeholder="0000" keyboardType="number-pad" maxLength={4} value={pin} onChangeText={setPin} error={err} />
            <Button title="Verify & pick up" onPress={verifyPin} loading={busy} disabled={pin.length !== 4} style={{ marginTop: space.sm }} />
          </Card>
        )}

        {s === 'picked_up' && (
          <Button title="Start trip to drop-off" onPress={() => advance('in_transit')} loading={busy} style={{ marginTop: space.md }} />
        )}

        {s === 'in_transit' && (
          <Button title="Mark as delivered" onPress={() => advance('delivered')} loading={busy} style={{ marginTop: space.md }} />
        )}

        {['delivered'].includes(s) && (
          <Card style={{ marginTop: space.md, alignItems: 'center' }}>
            <Text style={{ fontSize: 34 }}>🎉</Text>
            <H2>Delivered</H2>
            <P dim>{naira(dv.pricing?.riderEarning)} added to your earnings.</P>
          </Card>
        )}

        {['rider_assigned', 'rider_arrived'].includes(s) && (
          <Button title="Cancel job" variant="ghost"
            onPress={() => Alert.alert('Cancel job?', 'This returns the job to the pool.', [
              { text: 'Keep', style: 'cancel' },
              { text: 'Cancel job', style: 'destructive', onPress: () => advance('cancelled', 'rider_cancelled') },
            ])}
            style={{ marginTop: space.sm }} />
        )}

        {err && s !== 'rider_arrived' && <P style={{ color: colors.danger, marginTop: space.sm }}>{err}</P>}
        <Button title="Back to dashboard" variant="ghost" onPress={() => navigation.navigate('RiderHome')} style={{ marginTop: space.lg }} />
      </View>
    </Screen>
  );
}

function Leg({ glyph, label, value }) {
  return (
    <View style={st.leg}>
      <Text style={st.legGlyph}>{glyph}</Text>
      <View style={{ flex: 1 }}>
        <Text style={st.legLabel}>{label}</Text>
        <Text style={st.legVal}>{value}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  head:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  earn:     { color: colors.primary, fontFamily: font.semi, fontSize: 15, marginTop: 4 },
  leg:      { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 6 },
  legGlyph: { fontSize: 13, marginRight: space.sm, marginTop: 2 },
  legLabel: { color: colors.textDim, fontFamily: font.regular, fontSize: 11 },
  legVal:   { color: colors.text, fontFamily: font.medium, fontSize: 14 },
  contact:  { borderTopWidth: 1, borderTopColor: colors.border, marginTop: space.sm, paddingTop: space.sm },
  cname:    { color: colors.text, fontFamily: font.medium, fontSize: 14 },
  call:     { color: colors.primary, fontFamily: font.semi, fontSize: 14, marginTop: 4 },
});
