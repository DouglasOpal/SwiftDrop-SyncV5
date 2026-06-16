// src/screens/rider/EarningsScreen.js
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { H1, H2, P, Button, Card, Loader } from '../../components/ui';
import { riderService } from '../../services/riderService';
import { colors, font, radius, space, naira } from '../../theme';

export default function EarningsScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const res = await riderService.earnings(); setData(res.data.data); } catch { setData({}); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  if (data === null) return <Loader label="Loading earnings…" />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
      <H1 style={{ marginBottom: space.md }}>Earnings</H1>

      <Card style={st.lifetime}>
        <Text style={st.lifeLabel}>Lifetime earnings</Text>
        <Text style={st.lifeVal}>{data.lifetime?.text || '₦0'}</Text>
        <Text style={st.lifeSub}>{data.completed || 0} completed · ⭐ {data.rating?.toFixed?.(1) || data.rating || '—'}</Text>
      </Card>

      <View style={st.row}>
        <Card style={st.half}><Text style={st.label}>Today</Text><Text style={st.val}>{data.today?.text || '₦0'}</Text><Text style={st.sub}>{data.today?.count || 0} trips</Text></Card>
        <Card style={st.half}><Text style={st.label}>This week</Text><Text style={st.val}>{data.thisWeek?.text || '₦0'}</Text><Text style={st.sub}>{data.thisWeek?.count || 0} trips</Text></Card>
      </View>

      {!data.bankSet && (
        <Card style={[st.warn, { marginTop: space.md }]}>
          <H2>Add your bank account</H2>
          <P dim style={{ marginTop: 4 }}>You need verified bank details to receive payouts.</P>
          <Button title="Set bank details" onPress={() => navigation.getParent()?.navigate('Account', { screen: 'BankDetails' })} style={{ marginTop: space.sm }} />
        </Card>
      )}

      <H2 style={{ marginTop: space.xl, marginBottom: space.sm }}>Recent payouts</H2>
      {(data.recent || []).length === 0 ? (
        <P dim>No completed deliveries yet.</P>
      ) : data.recent.map((r) => (
        <Card key={r.id} style={st.payout}>
          <View style={{ flex: 1 }}>
            <Text style={st.pTo} numberOfLines={1}>{r.to || `#${r.code}`}</Text>
            <Text style={st.pAt}>{r.at ? new Date(r.at).toLocaleDateString() : ''} · #{r.code}</Text>
          </View>
          <Text style={st.pAmt}>{r.text}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  lifetime:  { alignItems: 'center', borderColor: colors.primary },
  lifeLabel: { color: colors.textDim, fontFamily: font.medium, fontSize: 13 },
  lifeVal:   { color: colors.primary, fontFamily: font.displayX, fontSize: 38, marginTop: 4 },
  lifeSub:   { color: colors.textDim, fontFamily: font.regular, fontSize: 13, marginTop: 4 },
  row:       { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  half:      { flex: 1 },
  label:     { color: colors.textDim, fontFamily: font.medium, fontSize: 12 },
  val:       { color: colors.text, fontFamily: font.displayX, fontSize: 22, marginTop: 4 },
  sub:       { color: colors.textDim, fontFamily: font.regular, fontSize: 11, marginTop: 2 },
  warn:      { borderColor: colors.warn },
  payout:    { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm },
  pTo:       { color: colors.text, fontFamily: font.medium, fontSize: 14 },
  pAt:       { color: colors.textDim, fontFamily: font.regular, fontSize: 12, marginTop: 2 },
  pAmt:      { color: colors.primary, fontFamily: font.semi, fontSize: 15 },
});
