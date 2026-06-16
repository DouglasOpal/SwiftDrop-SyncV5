// src/screens/auth/UserAuthScreen.js
import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen, H1, P, Button, Field } from '../../components/ui';
import { authService } from '../../services/authService';
import { errMsg } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { space } from '../../theme';

export default function UserAuthScreen() {
  const { loginUser, updateProfile } = useAuth();
  const [step, setStep]   = useState('phone'); // phone | otp | profile
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState('signin');
  const [code, setCode]   = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [homeArea, setHomeArea] = useState('');
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState(null);

  const normalize = (p) => p.replace(/\s+/g, '');

  async function sendOtp() {
    setErr(null); setBusy(true);
    const ph = normalize(phone);
    try {
      await authService.userSendOtp(ph, 'signin');
      setPurpose('signin'); setStep('otp');
    } catch (e) {
      // No account yet → register on the fly
      if (e?.response?.data?.code === 'ACCOUNT_NOT_FOUND') {
        try {
          await authService.userSendOtp(ph, 'signup');
          setPurpose('signup'); setStep('otp');
        } catch (e2) { setErr(errMsg(e2)); }
      } else { setErr(errMsg(e)); }
    } finally { setBusy(false); }
  }

  async function verify() {
    setErr(null); setBusy(true);
    try {
      const { data } = await authService.userVerifyOtp(normalize(phone), code.trim(), purpose);
      await loginUser(data.user, { accessToken: data.accessToken, refreshToken: data.refreshToken });
      if (!data.isProfileComplete) setStep('profile');
      // else: AppNavigator swaps to the user tabs automatically
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  async function saveProfile() {
    setErr(null); setBusy(true);
    try {
      const { data } = await authService.userProfile({ fullName, email, homeArea });
      await updateProfile(data.user);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <Screen scroll>
      {step === 'phone' && (
        <View style={{ marginTop: space.xl }}>
          <H1>Your phone number</H1>
          <P dim style={{ marginBottom: space.lg }}>We'll text you a 6-digit code to sign in or create your account.</P>
          <Field label="Phone" placeholder="0803 000 0000" keyboardType="phone-pad" value={phone} onChangeText={setPhone} error={err} />
          <Button title="Send code" onPress={sendOtp} loading={busy} disabled={phone.length < 7} style={{ marginTop: space.md }} />
        </View>
      )}

      {step === 'otp' && (
        <View style={{ marginTop: space.xl }}>
          <H1>Enter the code</H1>
          <P dim style={{ marginBottom: space.lg }}>Sent to {phone}. Enter the 6-digit code.</P>
          <Field label="Verification code" placeholder="000000" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} error={err} />
          <Button title="Verify" onPress={verify} loading={busy} disabled={code.length !== 6} style={{ marginTop: space.md }} />
          <Button title="Change number" variant="ghost" onPress={() => { setStep('phone'); setCode(''); setErr(null); }} style={{ marginTop: space.sm }} />
        </View>
      )}

      {step === 'profile' && (
        <View style={{ marginTop: space.xl }}>
          <H1>Almost there</H1>
          <P dim style={{ marginBottom: space.lg }}>Tell us a little about you so riders know who they're helping.</P>
          <Field label="Full name" placeholder="Jane Doe" value={fullName} onChangeText={setFullName} />
          <Field label="Email (optional)" placeholder="jane@email.com" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
          <Field label="Home area" placeholder="e.g. Lekki Phase 1" value={homeArea} onChangeText={setHomeArea} error={err} />
          <Button title="Continue" onPress={saveProfile} loading={busy} disabled={!fullName.trim()} style={{ marginTop: space.md }} />
        </View>
      )}
    </Screen>
  );
}
