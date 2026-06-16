// src/screens/admin/AdminHomeScreen.js
// Mobile admin: dashboard summary, revenue/platform-fee/payout split (feature 6),
// and a per-rider delivery-history drill-in (feature 5). The full control panel
// runs in the browser at the backend's /admin route.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, H1, H2, P, Button, Card, StatusPill, Loader } from '../../components/ui';
import { adminService } from '../../services/adminService';
import { useAuth } from '../../context/AuthContext';
import { colors, font, radius, space, naira } from '../../theme';

export default function AdminHomeScreen() {
  const { logout } = useAuth();
  const [dash, setDash] = useState(null);
  const [ana, setAna]   = useState(null);
  const [riders, setRiders] = useState([]);
  const [openRider, setOpenRider] = useState(null);
  const [history, setHistory] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await adminService.dashboard(); setDash(data.data); } catch {}
    try { const { data } = await adminService.analytics(30); setAna(data.data); } catch {}
    try { const { data } = await adminService.riders({ limit: 20 }); setRiders(data.data || []); } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  async function openHistory(rider) {
    if (openRider === rider._id) { setOpenRider(null); setHistory(null); return; }
    setOpenRider(rider._id); setHistory(null);
    try { const { data } = await adminService.riderHistory(rider._id, { limit: 20 }); setHistory(data); }
    catch { setHistory({ data: [], summary: null }); }
  }

  if (!dash && !ana) return <Loader label="Loading dashboard…" />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
      <H1>Operations</H1>
      <P dim style={{ marginBottom: space.md }}>Last 30 days · full panel at /admin in your browser.</P>

      {/* Revenue split — feature 6 */}
      <Card style={st.revCard}>
        <Text style={st.revLabel}>Gross revenue (30d)</Text>
        <Text style={st.revVal}>{naira(ana?.periodRevenue)}</Text>
        <View style={st.splitRow}>
          <View style={st.split}><Text style={st.splitLabel}>Platform fee</Text><Text style={[st.splitVal, { color: colors.primary }]}>{naira(ana?.periodPlatformFee)}</Text></View>
          <View style={st.split}><Text style={st.splitLabel}>Rider payouts</Text><Text style={st.splitVal}>{naira(ana?.periodRiderPayout)}</Text></View>
        </View>
        <Text style={st.allTime}>All-time platform fee: {naira(ana?.allTimePlatformFee)} · {ana?.allTimeDeliveries || 0} delivered</Text>
      </Card>

      {/* Quick stats */}
      <View style={st.statRow}>
        <Stat label="Users" value={dash?.users?.total} sub={`+${dash?.users?.newToday || 0} today`} />
        <Stat label="Riders" value={dash?.riders?.total} sub={`${dash?.riders?.pendingKYC || 0} pending KYC`} />
      </View>
      <View style={st.statRow}>
        <Stat label="Deliveries" value={dash?.deliveries?.total} sub={`${dash?.deliveries?.today || 0} today`} />
        <Stat label="Active now" value={dash?.deliveries?.active} sub="in progress" />
      </View>

      {/* Delivery status breakdown — feature 6 */}
      {ana?.statusBreakdown?.length > 0 && (
        <Card style={{ marginTop: space.md }}>
          <H2>Delivery status (30d)</H2>
          <View style={{ marginTop: space.sm }}>
            {ana.statusBreakdown.map((s) => (
              <View key={s._id} style={st.brkRow}>
                <StatusPill status={s._id} />
                <Text style={st.brkCount}>{s.count}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {/* Per-rider delivery history — feature 5 */}
      <H2 style={{ marginTop: space.xl, marginBottom: space.sm }}>Riders — delivery history</H2>
      {riders.length === 0 ? <P dim>No riders yet.</P> : riders.map((r) => (
        <Card key={r._id} style={{ marginBottom: space.sm }}>
          <Pressable onPress={() => openHistory(r)} style={st.riderRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.rName}>{r.fullName}</Text>
              <Text style={st.rSub}>{r.stats?.completedDeliveries || 0} completed · {naira(r.stats?.totalEarnings)} earned</Text>
            </View>
            <Text style={st.chev}>{openRider === r._id ? '▾' : '›'}</Text>
          </Pressable>

          {openRider === r._id && (
            <View style={st.historyWrap}>
              {history === null ? (
                <P dim>Loading history…</P>
              ) : (
                <>
                  {history.summary && (
                    <View style={st.sumRow}>
                      <SumChip label="Completed" value={history.summary.completed} />
                      <SumChip label="Rider earnings" value={naira(history.summary.riderEarnings)} />
                      <SumChip label="Platform fees" value={naira(history.summary.platformFees)} />
                    </View>
                  )}
                  {(history.data || []).length === 0 ? (
                    <P dim>No deliveries.</P>
                  ) : history.data.slice(0, 10).map((d) => (
                    <View key={d._id} style={st.hRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={st.hRoute} numberOfLines={1}>{d.pickup?.address} → {d.dropoff?.address}</Text>
                        <Text style={st.hMeta}>#{d.trackingCode} · {naira(d.pricing?.totalFee)}</Text>
                      </View>
                      <StatusPill status={d.status} />
                    </View>
                  ))}
                </>
              )}
            </View>
          )}
        </Card>
      ))}

      <Button title="Sign out" variant="ghost" onPress={logout} style={{ marginTop: space.xl }} />
    </ScrollView>
  );
}

function Stat({ label, value, sub }) {
  return (
    <Card style={st.stat}>
      <Text style={st.statLabel}>{label}</Text>
      <Text style={st.statVal}>{value ?? 0}</Text>
      <Text style={st.statSub}>{sub}</Text>
    </Card>
  );
}
function SumChip({ label, value }) {
  return (
    <View style={st.sumChip}>
      <Text style={st.sumLabel}>{label}</Text>
      <Text style={st.sumVal}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  revCard:    { borderColor: colors.primary },
  revLabel:   { color: colors.textDim, fontFamily: font.medium, fontSize: 13 },
  revVal:     { color: colors.text, fontFamily: font.displayX, fontSize: 32, marginTop: 4 },
  splitRow:   { flexDirection: 'row', gap: space.lg, marginTop: space.md },
  split:      { flex: 1 },
  splitLabel: { color: colors.textDim, fontFamily: font.regular, fontSize: 12 },
  splitVal:   { color: colors.text, fontFamily: font.semi, fontSize: 18, marginTop: 2 },
  allTime:    { color: colors.textDim, fontFamily: font.regular, fontSize: 12, marginTop: space.md },
  statRow:    { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  stat:       { flex: 1 },
  statLabel:  { color: colors.textDim, fontFamily: font.medium, fontSize: 12 },
  statVal:    { color: colors.text, fontFamily: font.displayX, fontSize: 24, marginTop: 4 },
  statSub:    { color: colors.textDim, fontFamily: font.regular, fontSize: 11, marginTop: 2 },
  brkRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 4 },
  brkCount:   { color: colors.text, fontFamily: font.semi, fontSize: 15 },
  riderRow:   { flexDirection: 'row', alignItems: 'center' },
  rName:      { color: colors.text, fontFamily: font.semi, fontSize: 15 },
  rSub:       { color: colors.textDim, fontFamily: font.regular, fontSize: 12, marginTop: 2 },
  chev:       { color: colors.textDim, fontSize: 20, marginLeft: space.sm },
  historyWrap:{ borderTopWidth: 1, borderTopColor: colors.border, marginTop: space.sm, paddingTop: space.sm },
  sumRow:     { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  sumChip:    { flex: 1, backgroundColor: colors.surface2, borderRadius: radius.md, padding: space.sm },
  sumLabel:   { color: colors.textDim, fontFamily: font.regular, fontSize: 10 },
  sumVal:     { color: colors.text, fontFamily: font.semi, fontSize: 13, marginTop: 2 },
  hRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  hRoute:     { color: colors.text, fontFamily: font.medium, fontSize: 13 },
  hMeta:      { color: colors.textDim, fontFamily: font.regular, fontSize: 11, marginTop: 2 },
});
