// src/screens/user/HistoryScreen.js
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { H1, P, Card, StatusPill, Loader } from '../../components/ui';
import { deliveryService } from '../../services/deliveryService';
import { colors, font, space, naira } from '../../theme';

export default function HistoryScreen({ navigation }) {
  const [items, setItems] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await deliveryService.mine({ limit: 50 }); setItems(data.data || []); }
    catch { setItems([]); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  if (items === null) return <Loader label="Loading your deliveries…" />;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.lg }}
      data={items}
      keyExtractor={(d) => d._id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={<H1 style={{ marginBottom: space.md }}>Your orders</H1>}
      ListEmptyComponent={<P dim>No deliveries yet. Your bookings will appear here.</P>}
      renderItem={({ item }) => (
        <Card onPress={() => navigation.navigate('Tracking', { deliveryId: item._id })} style={st.row}>
          <View style={{ flex: 1 }}>
            <Text style={st.route} numberOfLines={1}>{item.pickup?.address} → {item.dropoff?.address}</Text>
            <Text style={st.meta}>#{item.trackingCode} · {naira(item.pricing?.totalFee)} · {new Date(item.createdAt).toLocaleDateString()}</Text>
          </View>
          <StatusPill status={item.status} />
        </Card>
      )}
    />
  );
}

const st = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm },
  route: { color: colors.text, fontFamily: font.semi, fontSize: 14 },
  meta:  { color: colors.textDim, fontFamily: font.regular, fontSize: 12, marginTop: 3 },
});
