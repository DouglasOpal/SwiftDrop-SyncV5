// src/screens/user/CreateDeliveryScreen.js
// FEATURES 9 & 10 — route selection (radius-priority picker) + fee with 30% admin markup.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Screen, H2, P, Button, Card } from '../../components/ui';
import { deliveryService } from '../../services/deliveryService';
import { errMsg } from '../../services/api';
import { colors, font, radius, space } from '../../theme';

const SIZES = [
  { key: 'small',  label: 'Small',  hint: 'Envelope · docs' },
  { key: 'medium', label: 'Medium', hint: 'Shoebox' },
  { key: 'large',  label: 'Large',  hint: 'Carton' },
];
const PAY = [{ key: 'cash', label: 'Cash' }, { key: 'wallet', label: 'Wallet' }, { key: 'card', label: 'Card' }];

export default function CreateDeliveryScreen({ navigation, route }) {
  const [pickup, setPickup]   = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [size, setSize]       = useState('medium');
  const [insured, setInsured] = useState(true);
  const [method, setMethod]   = useState('cash');
  const [quote, setQuote]     = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState(null);

  // Receive the picked location back from LocationPicker
  const onPick = useCallback((field, picked) => {
    if (field === 'pickup') setPickup(picked); else setDropoff(picked);
  }, []);

  function openPicker(field) {
    navigation.navigate('LocationPicker', { field, onPick });
  }

  // Re-quote whenever route or parcel options change
  useEffect(() => {
    if (!pickup || !dropoff) { setQuote(null); return; }
    let cancelled = false;
    (async () => {
      setQuoting(true); setErr(null);
      try {
        const { data } = await deliveryService.quote({
          pickup:  { lat: pickup.lat,  lng: pickup.lng },
          dropoff: { lat: dropoff.lat, lng: dropoff.lng },
          parcel:  { size, insured },
        });
        if (!cancelled) setQuote(data);
      } catch (e) { if (!cancelled) setErr(errMsg(e)); }
      finally { if (!cancelled) setQuoting(false); }
    })();
    return () => { cancelled = true; };
  }, [pickup, dropoff, size, insured]);

  async function confirm() {
    setBusy(true); setErr(null);
    try {
      const { data } = await deliveryService.create({
        pickup:  { address: pickup.address,  area: pickup.area,  lat: pickup.lat,  lng: pickup.lng },
        dropoff: { address: dropoff.address, area: dropoff.area, lat: dropoff.lat, lng: dropoff.lng },
        parcel:  { size, insured },
        payment: { method },
      });
      navigation.replace('FindingRider', { deliveryId: data.delivery.id, trackingCode: data.delivery.trackingCode });
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  const d = quote?.pricing?.display;

  return (
    <Screen scroll>
      <H2>Route</H2>
      <RouteBtn label="Pickup" value={pickup} onPress={() => openPicker('pickup')} glyph="🟢" />
      <RouteBtn label="Drop-off" value={dropoff} onPress={() => openPicker('dropoff')} glyph="🔴" />

      <H2 style={{ marginTop: space.lg }}>Parcel size</H2>
      <View style={st.segRow}>
        {SIZES.map((s) => (
          <Pressable key={s.key} onPress={() => setSize(s.key)} style={[st.seg, size === s.key && st.segOn]}>
            <Text style={[st.segLabel, size === s.key && st.segLabelOn]}>{s.label}</Text>
            <Text style={st.segHint}>{s.hint}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={() => setInsured((v) => !v)} style={st.toggle}>
        <Text style={st.toggleLabel}>Insure this parcel</Text>
        <View style={[st.switch, insured && st.switchOn]}><View style={[st.knob, insured && st.knobOn]} /></View>
      </Pressable>

      <H2 style={{ marginTop: space.lg }}>Payment</H2>
      <View style={st.segRow}>
        {PAY.map((p) => (
          <Pressable key={p.key} onPress={() => setMethod(p.key)} style={[st.seg, method === p.key && st.segOn]}>
            <Text style={[st.segLabel, method === p.key && st.segLabelOn]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Fee breakdown with explicit 30% admin fee line */}
      <Card style={{ marginTop: space.lg }}>
        <H2>Fare estimate</H2>
        {!pickup || !dropoff ? (
          <P dim style={{ marginTop: 4 }}>Choose both locations to see your price.</P>
        ) : quoting ? (
          <P dim style={{ marginTop: 4 }}>Calculating…</P>
        ) : d ? (
          <View style={{ marginTop: space.sm }}>
            <FeeRow label="Base fare" value={d.base} />
            <FeeRow label="Distance" value={d.distance} />
            {insured && <FeeRow label="Insurance" value={d.insurance} />}
            <FeeRow label="Rider earning (subtotal)" value={d.subtotal} />
            <FeeRow label={`Service fee (${Math.round((quote.pricing.adminFeeRate || 0.3) * 100)}%)`} value={d.adminFee} />
            <View style={st.divider} />
            <FeeRow label="You pay" value={d.total} bold />
            <Text style={st.meta}>{quote.distanceKm} km · ~{quote.estimatedMins} min</Text>
          </View>
        ) : null}
      </Card>

      {err && <P style={{ color: colors.danger, marginTop: space.sm }}>{err}</P>}
      <Button title="Find a rider" onPress={confirm} loading={busy} disabled={!quote || quoting} style={{ marginTop: space.md }} />
    </Screen>
  );
}

function RouteBtn({ label, value, onPress, glyph }) {
  return (
    <Pressable onPress={onPress}>
      <Card style={st.routeBtn}>
        <Text style={st.routeGlyph}>{glyph}</Text>
        <View style={{ flex: 1 }}>
          <Text style={st.routeLabel}>{label}</Text>
          <Text style={[st.routeVal, !value && { color: colors.textDim }]} numberOfLines={1}>
            {value ? value.address : 'Tap to choose'}
          </Text>
        </View>
        <Text style={st.routeGo}>›</Text>
      </Card>
    </Pressable>
  );
}

function FeeRow({ label, value, bold }) {
  return (
    <View style={st.feeRow}>
      <Text style={[st.feeLabel, bold && st.feeBold]}>{label}</Text>
      <Text style={[st.feeVal, bold && st.feeBold]}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  routeBtn:   { flexDirection: 'row', alignItems: 'center', marginTop: space.sm },
  routeGlyph: { fontSize: 16, marginRight: space.md },
  routeLabel: { color: colors.textDim, fontFamily: font.medium, fontSize: 12 },
  routeVal:   { color: colors.text, fontFamily: font.semi, fontSize: 15, marginTop: 2 },
  routeGo:    { color: colors.textDim, fontSize: 24, marginLeft: space.sm },
  segRow:     { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  seg:        { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: space.md, alignItems: 'center' },
  segOn:      { borderColor: colors.primary, backgroundColor: colors.surface2 },
  segLabel:   { color: colors.text, fontFamily: font.semi, fontSize: 14 },
  segLabelOn: { color: colors.primary },
  segHint:    { color: colors.textDim, fontFamily: font.regular, fontSize: 11, marginTop: 2 },
  toggle:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md },
  toggleLabel:{ color: colors.text, fontFamily: font.medium, fontSize: 15 },
  switch:     { width: 48, height: 28, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, padding: 2, justifyContent: 'center' },
  switchOn:   { backgroundColor: colors.primary, borderColor: colors.primary },
  knob:       { width: 22, height: 22, borderRadius: 999, backgroundColor: colors.textDim },
  knobOn:     { backgroundColor: '#04150B', alignSelf: 'flex-end' },
  feeRow:     { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  feeLabel:   { color: colors.textDim, fontFamily: font.regular, fontSize: 14 },
  feeVal:     { color: colors.text, fontFamily: font.medium, fontSize: 14 },
  feeBold:    { color: colors.text, fontFamily: font.semi, fontSize: 16 },
  divider:    { height: 1, backgroundColor: colors.border, marginVertical: space.sm },
  meta:       { color: colors.textDim, fontFamily: font.regular, fontSize: 12, marginTop: space.sm },
});
