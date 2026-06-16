// src/screens/user/UserHomeScreen.js
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen, H1, H2, P, Button, Card, StatusPill } from '../../components/ui';
import { deliveryService } from '../../services/deliveryService';
import { useAuth } from '../../context/AuthContext';
import { colors, font, space, naira } from '../../theme';

const ACTIVE = ['finding_rider', 'rider_assigned', 'rider_arrived', 'picked_up', 'in_transit'];

export default function UserHomeScreen({ navigation }) {
  const { profile } = useAuth();
  const [active, setActive] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await deliveryService.mine({ limit: 20 });
      setActive((data.data || []).filter((d) => ACTIVE.includes(d.status)));
    } catch { /* silent */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const firstName = (profile?.fullName || '').split(' ')[0] || 'there';

  return (
    <Screen scroll>
      <View style={{ marginTop: space.md, marginBottom: space.lg }}>
        <Text style={st.hello}>Hi {firstName} 👋</Text>
        <H1>Send something today?</H1>
      </View>

      <Card style={st.hero}>
        <Text style={st.heroGlyph}>📦</Text>
        <H2>New delivery</H2>
        <P dim style={{ marginTop: 4 }}>Pick a route, get an instant quote, and we'll find a nearby rider.</P>
        <Button title="Book a rider" onPress={() => navigation.navigate('CreateDelivery')} style={{ marginTop: space.md }} />
      </Card>

      {active.length > 0 && (
        <View style={{ marginTop: space.xl }}>
          <H2>In progress</H2>
          {active.map((d) => (
            <Card key={d._id} onPress={() => navigation.navigate('Tracking', { deliveryId: d._id })} style={st.row}>
              <View style={{ flex: 1 }}>
                <Text style={st.route} numberOfLines={1}>{d.pickup?.address} → {d.dropoff?.address}</Text>
                <Text style={st.code}>#{d.trackingCode} · {naira(d.pricing?.totalFee)}</Text>
              </View>
              <StatusPill status={d.status} />
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  hello:     { color: colors.textDim, fontFamily: font.medium, fontSize: 15, marginBottom: 4 },
  hero:      { alignItems: 'flex-start' },
  heroGlyph: { fontSize: 34, marginBottom: space.sm },
  row:       { flexDirection: 'row', alignItems: 'center', marginTop: space.sm },
  route:     { color: colors.text, fontFamily: font.semi, fontSize: 14 },
  code:      { color: colors.textDim, fontFamily: font.regular, fontSize: 12, marginTop: 2 },
});
