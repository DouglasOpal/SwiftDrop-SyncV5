// src/screens/auth/RoleSelectScreen.js
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, H1, P } from '../../components/ui';
import { colors, font, radius, space } from '../../theme';

const ROLES = [
  { key: 'UserAuth',  glyph: '📦', title: 'Send a parcel',   sub: 'Book riders and track deliveries in real time.' },
  { key: 'RiderAuth', glyph: '🛵', title: 'Ride & earn',      sub: 'Accept nearby jobs and get paid per delivery.' },
  { key: 'AdminLogin',glyph: '🛡️', title: 'Operations',       sub: 'Admin dashboard, KYC and revenue oversight.' },
];

export default function RoleSelectScreen({ navigation }) {
  return (
    <Screen scroll>
      <View style={{ marginTop: space.xxl, marginBottom: space.xl }}>
        <Text style={st.brand}>SwiftDrop</Text>
        <H1>Move anything, fast.</H1>
        <P dim style={{ marginTop: space.sm }}>
          Nigeria's on-demand dispatch network. Choose how you'd like to continue.
        </P>
      </View>

      {ROLES.map((r) => (
        <Pressable key={r.key} onPress={() => navigation.navigate(r.key)} style={({ pressed }) => [st.card, pressed && { opacity: 0.85 }]}>
          <LinearGradient
            colors={[colors.surface, colors.surface2]}
            style={st.grad}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <Text style={st.glyph}>{r.glyph}</Text>
            <View style={{ flex: 1 }}>
              <Text style={st.title}>{r.title}</Text>
              <Text style={st.sub}>{r.sub}</Text>
            </View>
            <Text style={st.arrow}>›</Text>
          </LinearGradient>
        </Pressable>
      ))}
    </Screen>
  );
}

const st = StyleSheet.create({
  brand:  { color: colors.primary, fontFamily: font.display, fontSize: 20, letterSpacing: 1, marginBottom: space.lg },
  card:   { marginBottom: space.md, borderRadius: radius.lg, overflow: 'hidden' },
  grad:   { flexDirection: 'row', alignItems: 'center', padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  glyph:  { fontSize: 30, marginRight: space.lg },
  title:  { color: colors.text, fontFamily: font.semi, fontSize: 17 },
  sub:    { color: colors.textDim, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  arrow:  { color: colors.textDim, fontSize: 30, marginLeft: space.sm },
});
