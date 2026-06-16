// src/screens/user/UserProfileScreen.js
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, H1, H2, P, Button, Field, Card } from '../../components/ui';
import { authService } from '../../services/authService';
import { errMsg } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { colors, font, space } from '../../theme';

export default function UserProfileScreen() {
  const { profile, updateProfile, logout } = useAuth();
  const [edit, setEdit] = useState(false);
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [email, setEmail]       = useState(profile?.email || '');
  const [homeArea, setHomeArea] = useState(profile?.homeArea || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);

  async function save() {
    setBusy(true); setErr(null);
    try { const { data } = await authService.userProfile({ fullName, email, homeArea }); await updateProfile(data.user); setEdit(false); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <Screen scroll>
      <View style={{ marginTop: space.md, alignItems: 'center' }}>
        <View style={st.avatar}><Text style={st.avatarTxt}>{(profile?.fullName || 'U')[0].toUpperCase()}</Text></View>
        <H1 style={{ marginTop: space.sm }}>{profile?.fullName || 'Your profile'}</H1>
        <P dim>{profile?.phone}</P>
      </View>

      {!edit ? (
        <Card style={{ marginTop: space.xl }}>
          <Field label="Full name" value={profile?.fullName || '—'} editable={false} />
          <Field label="Email" value={profile?.email || '—'} editable={false} />
          <Field label="Home area" value={profile?.homeArea || '—'} editable={false} />
          <Button title="Edit profile" variant="ghost" onPress={() => setEdit(true)} style={{ marginTop: space.sm }} />
        </Card>
      ) : (
        <Card style={{ marginTop: space.xl }}>
          <H2>Edit profile</H2>
          <Field label="Full name" value={fullName} onChangeText={setFullName} />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Home area" value={homeArea} onChangeText={setHomeArea} error={err} />
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
});
