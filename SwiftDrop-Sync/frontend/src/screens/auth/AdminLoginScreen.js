// src/screens/auth/AdminLoginScreen.js
import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen, H1, P, Button, Field } from '../../components/ui';
import { authService } from '../../services/authService';
import { errMsg } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { space } from '../../theme';

export default function AdminLoginScreen() {
  const { loginAdmin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);

  async function submit() {
    setErr(null); setBusy(true);
    try {
      const { data } = await authService.adminLogin(email.trim().toLowerCase(), password);
      await loginAdmin(data.admin || { email }, { accessToken: data.accessToken, refreshToken: data.refreshToken });
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <Screen scroll>
      <View style={{ marginTop: space.xxl }}>
        <H1>Admin sign in</H1>
        <P dim style={{ marginBottom: space.lg }}>For operations staff. The full control panel runs in your browser.</P>
        <Field label="Email" placeholder="admin@swiftdrop.ng" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <Field label="Password" placeholder="••••••••" secureTextEntry value={password} onChangeText={setPassword} error={err} />
        <Button title="Sign in" onPress={submit} loading={busy} disabled={!email.trim() || !password} style={{ marginTop: space.md }} />
      </View>
    </Screen>
  );
}
