// src/screens/user/TrackingScreen.js
// FEATURE 4 — live delivery tracking on a map for the user.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, H2, P, Button, Card, StatusPill } from '../../components/ui';
import MapPanel from '../../components/MapPanel';
import { deliveryService } from '../../services/deliveryService';
import { errMsg } from '../../services/api';
import { POLL, DEFAULT_REGION } from '../../config';
import { colors, font, radius, space, statusMeta } from '../../theme';

const STEPS = ['rider_assigned', 'rider_arrived', 'picked_up', 'in_transit', 'delivered'];

// Statuses during which the sender still needs to show the pickup code.
const PICKUP_PENDING = ['rider_assigned', 'rider_arrived'];

export default function TrackingScreen({ route, navigation }) {
  const { deliveryId, pin: forwardedPin } = route.params;
  const [info, setInfo]   = useState(null);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [rating, setRating] = useState(0);
  const [rated, setRated]   = useState(false);
  const [err, setErr]       = useState(null);

  // Pickup code (PIN) the sender shows the rider at handover.
  const [pin, setPin]             = useState(forwardedPin || null);
  const [pinExpiresAt, setPinExp] = useState(null);
  const [pinErr, setPinErr]       = useState(null);
  const [pinBusy, setPinBusy]     = useState(false);

  const pollRef = useRef(null);
  const genTried = useRef(!!forwardedPin); // skip auto-gen if FindingRider already gave us one

  async function tick() {
    try {
      const { data } = await deliveryService.trackRider(deliveryId);
      setInfo(data);
      const r = data.riderLocation;
      if (r?.lat != null) setRegion((reg) => ({ ...reg, latitude: r.lat, longitude: r.lng }));
      else if (data.pickup?.lat != null) setRegion((reg) => ({ ...reg, latitude: data.pickup.lat, longitude: data.pickup.lng }));
      if (data.status === 'delivered' || data.status === 'cancelled' || data.status === 'failed') stop();
    } catch (e) { setErr(errMsg(e)); }
  }
  function stop() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }

  async function genPin() {
    setPinBusy(true);
    setPinErr(null);
    try {
      const r = await deliveryService.genPickupOtp(deliveryId);
      setPin(r.data.code);
      setPinExp(r.data.expiresAt || null);
      genTried.current = true;
    } catch (e) {
      setPinErr(errMsg(e));
    } finally {
      setPinBusy(false);
    }
  }

  // Auto-generate a pickup code once a rider is assigned, if we weren't handed one.
  useEffect(() => {
    if (!info?.status) return;
    if (PICKUP_PENDING.includes(info.status) && !pin && !genTried.current && !pinBusy) {
      genTried.current = true;
      genPin();
    }
  }, [info?.status]);

  useEffect(() => {
    tick();
    pollRef.current = setInterval(tick, POLL.tracking);
    return () => stop();
  }, []);

  async function submitRating(stars) {
    setRating(stars);
    try { await deliveryService.rate(deliveryId, { rating: stars }); setRated(true); }
    catch (e) { setErr(errMsg(e)); }
  }

  const markers = [];
  if (info?.pickup?.lat != null)  markers.push({ id: 'p', lat: info.pickup.lat,  lng: info.pickup.lng,  title: 'Pickup',  color: colors.accent });
  if (info?.dropoff?.lat != null) markers.push({ id: 'd', lat: info.dropoff.lat, lng: info.dropoff.lng, title: 'Drop-off', color: colors.danger });
  if (info?.riderLocation?.lat != null) markers.push({ id: 'r', lat: info.riderLocation.lat, lng: info.riderLocation.lng, title: 'Rider', color: colors.primary });

  const route2 = [];
  if (info?.riderLocation?.lat != null && info?.dropoff?.lat != null) {
    route2.push({ lat: info.riderLocation.lat, lng: info.riderLocation.lng });
    route2.push({ lat: info.dropoff.lat, lng: info.dropoff.lng });
  }

  const stepIndex = STEPS.indexOf(info?.status);
  const delivered = info?.status === 'delivered';

  return (
    <Screen scroll padded={false}>
      <MapPanel region={region} markers={markers} route={route2} height={300} />

      <View style={{ padding: space.lg }}>
        <View style={st.head}>
          <H2>{statusMeta[info?.status]?.label || 'Tracking'}</H2>
          {info?.status && <StatusPill status={info.status} />}
        </View>

        {info?.rider && (
          <Card style={{ marginTop: space.sm }}>
            <Text style={st.rname}>{info.rider.name}</Text>
            <Text style={st.sub}>{info.rider.vehicle?.make} {info.rider.vehicle?.model} · {info.rider.vehicle?.plateNumber}</Text>
            {info.rider.phone ? <Text style={st.sub}>📞 {info.rider.phone}</Text> : null}
          </Card>
        )}

        {/* pickup code — shown until the rider confirms pickup */}
        {info?.status && PICKUP_PENDING.includes(info.status) && (
          <Card style={{ marginTop: space.md, alignItems: 'center' }}>
            <H2>Pickup code</H2>
            {pin ? (
              <>
                <Text style={st.pin}>{pin}</Text>
                <P dim style={{ textAlign: 'center' }}>
                  Give this code to your rider at handover. Don't share it before they arrive.
                </P>
                <Button
                  title="Regenerate code"
                  variant="ghost"
                  loading={pinBusy}
                  onPress={genPin}
                  style={{ marginTop: space.sm }}
                />
              </>
            ) : pinBusy ? (
              <P dim style={{ marginTop: space.sm }}>Generating code…</P>
            ) : (
              <>
                <P style={{ color: colors.danger, textAlign: 'center', marginTop: space.sm }}>
                  {pinErr || 'Could not generate a pickup code.'}
                </P>
                <Button title="Try again" loading={pinBusy} onPress={genPin} style={{ marginTop: space.sm }} />
              </>
            )}
          </Card>
        )}

        {info?.status && ['picked_up', 'in_transit', 'delivered'].includes(info.status) && (
          <Card style={{ marginTop: space.md, alignItems: 'center' }}>
            <Text style={st.confirmed}>✓ Pickup confirmed</Text>
          </Card>
        )}

        {/* status timeline */}
        <Card style={{ marginTop: space.md }}>
          {STEPS.map((s, i) => {
            const done = stepIndex >= i;
            return (
              <View key={s} style={st.tlRow}>
                <View style={[st.dot, done && { backgroundColor: colors.primary, borderColor: colors.primary }]} />
                <Text style={[st.tlLabel, done && { color: colors.text }]}>{statusMeta[s]?.label || s}</Text>
              </View>
            );
          })}
        </Card>

        {delivered && (
          <Card style={{ marginTop: space.md, alignItems: 'center' }}>
            <H2>Rate your rider</H2>
            <View style={st.stars}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Text key={n} onPress={() => !rated && submitRating(n)} style={[st.star, n <= rating && { color: colors.warn }]}>★</Text>
              ))}
            </View>
            {rated && <P dim>Thanks for your feedback!</P>}
          </Card>
        )}

        {err && <P style={{ color: colors.danger, marginTop: space.sm }}>{err}</P>}
        <Button title="Done" variant="ghost" onPress={() => navigation.popToTop()} style={{ marginTop: space.lg }} />
      </View>
    </Screen>
  );
}

const st = StyleSheet.create({
  head:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rname:   { color: colors.text, fontFamily: font.semi, fontSize: 16 },
  sub:     { color: colors.textDim, fontFamily: font.regular, fontSize: 13, marginTop: 3 },
  tlRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  dot:     { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, marginRight: space.md },
  tlLabel: { color: colors.textDim, fontFamily: font.medium, fontSize: 14 },
  stars:   { flexDirection: 'row', marginVertical: space.sm },
  star:    { fontSize: 34, color: colors.border, paddingHorizontal: 4 },
  pin:     { color: colors.primary, fontFamily: font.displayX, fontSize: 44, letterSpacing: 8, marginVertical: space.sm },
  confirmed: { color: colors.primary, fontFamily: font.semi, fontSize: 16 },
});
