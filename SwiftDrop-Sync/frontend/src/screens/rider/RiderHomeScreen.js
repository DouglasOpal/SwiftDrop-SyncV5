// src/screens/rider/RiderHomeScreen.js
// FEATURES 2 & 7 — rider goes online and the app pushes location heartbeats so the
// rider stays discoverable; navigation hub to the active delivery and other screens.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, H1, H2, P, Button, Card } from '../../components/ui';
import { riderService } from '../../services/riderService';
import { errMsg } from '../../services/api';
import { getCurrentLocation } from '../../utils/places';
import { useAuth } from '../../context/AuthContext';
import { POLL } from '../../config';
import { colors, font, radius, space, naira } from '../../theme';

const KYC_NOTE = {
  pending_documents: { label: 'Upload pending', color: colors.warn,  msg: 'Finish uploading your documents to start earning.' },
  under_review:      { label: 'Under review',   color: colors.accent,msg: 'Your documents are being reviewed. We\'ll notify you once approved.' },
  approved:          { label: 'Approved',        color: colors.primary,msg: null },
  suspended:         { label: 'Suspended',        color: colors.danger, msg: 'Your account is suspended. Contact support.' },
  rejected:          { label: 'Rejected',         color: colors.danger, msg: 'Your application was rejected. Contact support.' },
};

export default function RiderHomeScreen({ navigation }) {
  const { profile } = useAuth();
  const approved = profile?.status === 'approved';
  const [online, setOnline] = useState(!!profile?.isOnline);
  const [busy, setBusy]     = useState(false);
  const [earn, setEarn]     = useState(null);
  const [active, setActive] = useState(null);
  const hbRef = useRef(null);

  const kyc = KYC_NOTE[profile?.status] || KYC_NOTE.under_review;

  const loadSummary = useCallback(async () => {
    try { const { data } = await riderService.earnings(); setEarn(data.data); } catch {}
    try { const { data } = await riderService.activeJob(); setActive(data.data); } catch {}
  }, []);

  useFocusEffect(useCallback(() => { loadSummary(); }, [loadSummary]));

  async function pushOnce() {
    const loc = await getCurrentLocation();
    if (loc) { try { await riderService.pushLocation(loc.lat, loc.lng); } catch {} }
  }

  function startHeartbeat() {
    pushOnce();
    if (hbRef.current) clearInterval(hbRef.current);
    hbRef.current = setInterval(pushOnce, POLL.locationPush);
  }
  function stopHeartbeat() { if (hbRef.current) { clearInterval(hbRef.current); hbRef.current = null; } }

  useEffect(() => {
    if (online && approved) startHeartbeat(); else stopHeartbeat();
    return stopHeartbeat;
  }, [online, approved]);

  async function toggle() {
    if (!approved) { Alert.alert('Not approved yet', kyc.msg || 'Your account is not yet approved.'); return; }
    const next = !online;
    setBusy(true);
    try { const { data } = await riderService.setOnline(next); setOnline(data.isOnline); }
    catch (e) { Alert.alert('Could not update status', errMsg(e)); }
    finally { setBusy(false); }
  }

  return (
    <Screen scroll>
      <View style={{ marginTop: space.md }}>
        <Text style={st.hello}>Welcome back</Text>
        <H1>{(profile?.fullName || 'Rider').split(' ')[0]}</H1>
      </View>

      {/* KYC banner */}
      {kyc.msg && (
        <Card style={[st.kyc, { borderColor: kyc.color }]}>
          <Text style={[st.kycLabel, { color: kyc.color }]}>● {kyc.label}</Text>
          <P dim style={{ marginTop: 4 }}>{kyc.msg}</P>
        </Card>
      )}

      {/* Online toggle */}
      <Card style={{ marginTop: space.md }}>
        <View style={st.onlineRow}>
          <View style={{ flex: 1 }}>
            <H2>{online ? 'You\'re online' : 'You\'re offline'}</H2>
            <P dim style={{ marginTop: 2 }}>
              {online ? 'Sharing your location — nearby jobs will appear in Jobs.' : 'Go online to receive delivery requests.'}
            </P>
          </View>
          <Pressable onPress={toggle} disabled={busy} style={[st.switch, online && st.switchOn]}>
            <View style={[st.knob, online && st.knobOn]} />
          </Pressable>
        </View>
      </Card>

      {/* Active job */}
      {active && (
        <Card onPress={() => navigation.navigate('ActiveDelivery', { deliveryId: active._id })} style={{ marginTop: space.md, borderColor: colors.primary }}>
          <H2>Active delivery</H2>
          <Text style={st.route} numberOfLines={1}>{active.pickup?.address} → {active.dropoff?.address}</Text>
          <Text style={st.sub}>Earning {naira(active.pricing?.riderEarning)} · tap to continue</Text>
        </Card>
      )}

      {/* Today's earnings */}
      <View style={st.statRow}>
        <Card style={st.stat}><Text style={st.statLabel}>Today</Text><Text style={st.statVal}>{earn?.today?.text || '₦0'}</Text><Text style={st.statSub}>{earn?.today?.count || 0} trips</Text></Card>
        <Card style={st.stat}><Text style={st.statLabel}>This week</Text><Text style={st.statVal}>{earn?.thisWeek?.text || '₦0'}</Text><Text style={st.statSub}>{earn?.thisWeek?.count || 0} trips</Text></Card>
      </View>

      <Button title="View available jobs" onPress={() => navigation.getParent()?.navigate('Jobs')} style={{ marginTop: space.md }} />
      {!earn?.bankSet && (
        <Button title="Set your bank details to get paid" variant="ghost"
          onPress={() => navigation.getParent()?.navigate('Account', { screen: 'BankDetails' })} style={{ marginTop: space.sm }} />
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  hello:     { color: colors.textDim, fontFamily: font.medium, fontSize: 15 },
  kyc:       { marginTop: space.md },
  kycLabel:  { fontFamily: font.semi, fontSize: 14 },
  onlineRow: { flexDirection: 'row', alignItems: 'center' },
  switch:    { width: 56, height: 32, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, padding: 3, justifyContent: 'center' },
  switchOn:  { backgroundColor: colors.primary, borderColor: colors.primary },
  knob:      { width: 24, height: 24, borderRadius: 999, backgroundColor: colors.textDim },
  knobOn:    { backgroundColor: '#04150B', alignSelf: 'flex-end' },
  route:     { color: colors.text, fontFamily: font.semi, fontSize: 14, marginTop: 6 },
  sub:       { color: colors.textDim, fontFamily: font.regular, fontSize: 13, marginTop: 3 },
  statRow:   { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  stat:      { flex: 1 },
  statLabel: { color: colors.textDim, fontFamily: font.medium, fontSize: 12 },
  statVal:   { color: colors.text, fontFamily: font.displayX, fontSize: 22, marginTop: 4 },
  statSub:   { color: colors.textDim, fontFamily: font.regular, fontSize: 11, marginTop: 2 },
});
