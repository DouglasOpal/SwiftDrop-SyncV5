// src/screens/user/FindingRiderScreen.js
// FEATURE 3 — the assign screen. Polls the delivery, triggers rider matching,
// and surfaces the matched rider plus the pickup PIN to share.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Screen, H1, H2, P, Button, Card } from '../../components/ui';
import { deliveryService } from '../../services/deliveryService';
import { errMsg } from '../../services/api';
import { POLL } from '../../config';
import { colors, font, radius, space } from '../../theme';

export default function FindingRiderScreen({ route, navigation }) {
  const { deliveryId } = route.params;
  const [delivery, setDelivery] = useState(null);
  const [rider, setRider]   = useState(null);
  const [pin, setPin]       = useState(null);
  const [err, setErr]       = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef(null);
  const tickRef = useRef(null);
  const assignTried = useRef(false);

  async function tick() {
    try {
      const { data } = await deliveryService.get(deliveryId);
      const dv = data.data;
      setDelivery(dv);

      if (dv.status === 'finding_rider' && !assignTried.current) {
        assignTried.current = true;
        try {
          const res = await deliveryService.assignRider(deliveryId);
          if (res.data?.success && res.data.rider) setRider(res.data.rider);
          else assignTried.current = false; // no rider yet — let the next tick retry
        } catch { assignTried.current = false; }
      }

      if (['rider_assigned', 'rider_arrived', 'picked_up', 'in_transit'].includes(dv.status)) {
        if (dv.rider) setRider({ fullName: dv.rider.fullName, phone: dv.rider.phone, vehicle: dv.rider.vehicle, stats: dv.rider.stats });
        stop();
        if (!pin) { try { const r = await deliveryService.genPickupOtp(deliveryId); setPin(r.data.code); } catch {} }
      }
    } catch (e) { setErr(errMsg(e)); }
  }

  function stop() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }

  useEffect(() => {
    tick();
    pollRef.current = setInterval(tick, POLL.findingRider);
    tickRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { stop(); if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  const matched = rider && delivery && delivery.status !== 'finding_rider';

  return (
    <Screen scroll>
      {!matched ? (
        <View style={st.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <H1 style={{ marginTop: space.lg, textAlign: 'center' }}>Finding you a rider</H1>
          <P dim style={{ textAlign: 'center', marginTop: space.sm }}>
            Matching with the nearest available rider… {elapsed}s
          </P>
          {err && <P style={{ color: colors.danger, marginTop: space.md }}>{err}</P>}
          <Button title="Cancel search" variant="ghost" onPress={() => navigation.goBack()} style={{ marginTop: space.xl }} />
        </View>
      ) : (
        <View style={{ marginTop: space.lg }}>
          <Text style={st.tick}>✅</Text>
          <H1>Rider on the way</H1>
          <Card style={{ marginTop: space.md }}>
            <Text style={st.rname}>{rider.fullName}</Text>
            <Text style={st.sub}>{rider.vehicle?.make} {rider.vehicle?.model} · {rider.vehicle?.plateNumber}</Text>
            {rider.stats?.averageRating ? <Text style={st.sub}>⭐ {rider.stats.averageRating.toFixed?.(1) || rider.stats.averageRating}</Text> : null}
            {rider.phone ? <Text style={st.sub}>📞 {rider.phone}</Text> : null}
          </Card>

          {pin && (
            <Card style={{ marginTop: space.md, alignItems: 'center' }}>
              <H2>Pickup PIN</H2>
              <Text style={st.pin}>{pin}</Text>
              <P dim style={{ textAlign: 'center' }}>Share this code with your rider only, at handover.</P>
            </Card>
          )}

          <Button title="Track delivery" onPress={() => navigation.replace('Tracking', { deliveryId, pin })} style={{ marginTop: space.lg }} />
        </View>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', marginTop: space.xxl * 2 },
  tick:   { fontSize: 40, marginBottom: space.sm },
  rname:  { color: colors.text, fontFamily: font.semi, fontSize: 18 },
  sub:    { color: colors.textDim, fontFamily: font.regular, fontSize: 14, marginTop: 4 },
  pin:    { color: colors.primary, fontFamily: font.displayX, fontSize: 44, letterSpacing: 8, marginVertical: space.sm },
});
