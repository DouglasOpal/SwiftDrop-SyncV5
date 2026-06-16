// src/screens/rider/RiderProfileScreen.js
// FEATURE 7 — rider account screen with navigation to bank details, profile edit, logout.
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Screen, H1, H2, P, Button, Field, Card } from '../../components/ui';
import { riderService } from '../../services/riderService';
import { errMsg } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { colors, font, radius, space } from '../../theme';

const STATUS_COLOR = {
  approved: colors.primary, under_review: colors.accent,
  pending_documents: colors.warn, suspended: colors.danger, rejected: colors.danger,
};

export default function RiderProfileScreen({ navigation }) {
  const { profile, updateProfile, logout } = useAuth();
  const [edit, setEdit] = useState(false);
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [email, setEmail]       = useState(profile?.email || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);

  const statusLabel = (profile?.status || '').replace(/_/g, ' ');

  async function save() {
    setBusy(true); setErr(null);
    try { const { data } = await riderService.updateProfile({ fullName, email }); await updateProfile(data.rider); setEdit(false); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <Screen scroll>
      <View style={{ marginTop: space.md, alignItems: 'center' }}>
        <View style={st.avatar}><Text style={st.avatarTxt}>{(profile?.fullName || 'R')[0].toUpperCase()}</Text></View>
        <H1 style={{ marginTop: space.sm }}>{profile?.fullName || 'Rider'}</H1>
        <Text style={[st.status, { color: STATUS_COLOR[profile?.status] || colors.textDim }]}>● {statusLabel}</Text>
      </View>

      <Card style={{ marginTop: space.lg }}>
        <H2>Vehicle</H2>
        <P dim style={{ marginTop: 4 }}>
          {profile?.vehicle?.make} {profile?.vehicle?.model} {profile?.vehicle?.year ? `(${profile.vehicle.year})` : ''}
        </P>
        <P dim>Plate · {profile?.vehicle?.plateNumber || '—'}</P>
      </Card>

      <Pressable onPress={() => navigation.navigate('BankDetails')}>
        <Card style={[st.link, { marginTop: space.md }]}>
          <View style={{ flex: 1 }}>
            <Text style={st.linkTitle}>Bank details</Text>
            <Text style={st.linkSub}>
              {profile?.bankAccount?.accountNumber
                ? `${profile.bankAccount.bankName} · ••••${String(profile.bankAccount.accountNumber).slice(-4)}`
                : 'Add an account to receive payouts'}
            </Text>
          </View>
          <Text style={st.go}>›</Text>
        </Card>
      </Pressable>

      {!edit ? (
        <Card style={{ marginTop: space.md }}>
          <Field label="Full name" value={profile?.fullName || '—'} editable={false} />
          <Field label="Email" value={profile?.email || '—'} editable={false} />
          <Field label="Phone" value={profile?.phone || '—'} editable={false} />
          <Button title="Edit profile" variant="ghost" onPress={() => setEdit(true)} style={{ marginTop: space.sm }} />
        </Card>
      ) : (
        <Card style={{ marginTop: space.md }}>
          <H2>Edit profile</H2>
          <Field label="Full name" value={fullName} onChangeText={setFullName} />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" error={err} />
          <Button title="Save" onPress={save} loading={busy} style={{ marginTop: space.sm }} />
          <Button title="Cancel" variant="ghost" onPress={() => setEdit(false)} style={{ marginTop: space.sm }} />
        </Card>
      )}

      <Button title="Sign out" variant="ghost" onPress={logout} style={{ marginTop: space.xl }} />
    </Screen>
  );
}

const st = StyleSheet.create({
  avatar:    { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: colors.primary, fontFamily: font.displayX, fontSize: 30 },
  status:    { fontFamily: font.semi, fontSize: 13, marginTop: 6, textTransform: 'capitalize' },
  link:      { flexDirection: 'row', alignItems: 'center' },
  linkTitle: { color: colors.text, fontFamily: font.semi, fontSize: 15 },
  linkSub:   { color: colors.textDim, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  go:        { color: colors.textDim, fontSize: 24, marginLeft: space.sm },
});
