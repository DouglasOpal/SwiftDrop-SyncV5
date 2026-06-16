// src/screens/auth/RiderAuthScreen.js
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Screen, H1, H2, P, Button, Field, Card } from '../../components/ui';
import { authService } from '../../services/authService';
import { errMsg } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { colors, font, radius, space } from '../../theme';

const DOCS = [
  { type: 'drivers_licence',   label: "Driver's licence" },
  { type: 'bike_registration', label: 'Bike registration' },
  { type: 'selfie_with_id',    label: 'Selfie holding your ID' },
];

export default function RiderAuthScreen() {
  const { loginRider } = useAuth();
  const [step, setStep] = useState('intro'); // intro | register | docs | otp
  const [form, setForm] = useState({ fullName: '', phone: '', plate: '', bikeMake: '', bikeModel: '', bikeYear: '' });
  const [riderId, setRiderId] = useState(null);
  const [docs, setDocs] = useState({});       // { type: { uri, uploaded } }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function doRegister() {
    setErr(null); setBusy(true);
    try {
      const { data } = await authService.riderRegister({
        fullName:    form.fullName.trim(),
        phone:       form.phone.replace(/\s+/g, ''),
        plateNumber: form.plate.trim(),
        bikeMake:    form.bikeMake.trim(),
        bikeModel:   form.bikeModel.trim(),
        bikeYear:    form.bikeYear.trim(),
      });
      setRiderId(data.riderId);
      setStep('docs');
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  async function pick(docType) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to upload documents.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (res.canceled) return;
    const asset = res.assets[0];
    setDocs((d) => ({ ...d, [docType]: { uri: asset.uri, uploaded: false } }));
    try {
      await authService.riderUpload(riderId, docType, asset.uri, asset.mimeType || 'image/jpeg');
      setDocs((d) => ({ ...d, [docType]: { uri: asset.uri, uploaded: true } }));
    } catch (e) {
      setDocs((d) => ({ ...d, [docType]: { uri: asset.uri, uploaded: false, error: errMsg(e) } }));
      Alert.alert('Upload failed', errMsg(e));
    }
  }

  const allUploaded = DOCS.every((d) => docs[d.type]?.uploaded);

  async function sendOtp() {
    setErr(null); setBusy(true);
    try { await authService.riderSendOtp(form.phone.replace(/\s+/g, '')); setStep('otp'); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  async function verify() {
    setErr(null); setBusy(true);
    try {
      const { data } = await authService.riderVerifyOtp(form.phone.replace(/\s+/g, ''), code.trim());
      await loginRider(data.rider, { accessToken: data.accessToken, refreshToken: data.refreshToken });
      // AppNavigator switches to rider tabs; KYC status surfaces on the dashboard
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  return (
    <Screen scroll>
      {step === 'intro' && (
        <View style={{ marginTop: space.xl }}>
          <H1>Ride with SwiftDrop</H1>
          <P dim style={{ marginBottom: space.lg }}>
            Earn on every delivery. You'll register your bike, upload a few documents for verification, then verify your phone.
          </P>
          <Card>
            <P>What you'll need:</P>
            <Text style={st.li}>•  A valid driver's licence</Text>
            <Text style={st.li}>•  Your bike registration</Text>
            <Text style={st.li}>•  A selfie holding your ID</Text>
          </Card>
          <Button title="Get started" onPress={() => setStep('register')} style={{ marginTop: space.lg }} />
        </View>
      )}

      {step === 'register' && (
        <View style={{ marginTop: space.lg }}>
          <H1>Your details</H1>
          <Field label="Full name" placeholder="Adewale Kolawole" value={form.fullName} onChangeText={set('fullName')} />
          <Field label="Phone" placeholder="0803 000 0000" keyboardType="phone-pad" value={form.phone} onChangeText={set('phone')} />
          <H2 style={{ marginTop: space.md }}>Your bike</H2>
          <Field label="Plate number" placeholder="LAG-123-XY" autoCapitalize="characters" value={form.plate} onChangeText={set('plate')} />
          <Field label="Make" placeholder="Honda" value={form.bikeMake} onChangeText={set('bikeMake')} />
          <Field label="Model" placeholder="CB125" value={form.bikeModel} onChangeText={set('bikeModel')} />
          <Field label="Year" placeholder="2021" keyboardType="number-pad" value={form.bikeYear} onChangeText={set('bikeYear')} error={err} />
          <Button title="Continue" onPress={doRegister} loading={busy}
            disabled={!form.fullName.trim() || form.phone.length < 7 || !form.plate.trim()} style={{ marginTop: space.md }} />
        </View>
      )}

      {step === 'docs' && (
        <View style={{ marginTop: space.lg }}>
          <H1>Upload documents</H1>
          <P dim style={{ marginBottom: space.lg }}>Tap each item to attach a clear photo. Your account goes under review once all three are in.</P>
          {DOCS.map((d) => {
            const cur = docs[d.type];
            return (
              <Pressable key={d.type} onPress={() => pick(d.type)}>
                <Card style={[st.docRow, cur?.uploaded && { borderColor: colors.primary }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.docLabel}>{d.label}</Text>
                    <Text style={[st.docState, cur?.uploaded && { color: colors.primary }]}>
                      {cur?.uploaded ? 'Uploaded ✓' : cur ? 'Uploading…' : 'Tap to add photo'}
                    </Text>
                  </View>
                  <Text style={st.docGlyph}>{cur?.uploaded ? '✅' : '📎'}</Text>
                </Card>
              </Pressable>
            );
          })}
          <Button title="Continue to verification" onPress={sendOtp} loading={busy} disabled={!allUploaded} style={{ marginTop: space.md }} />
          {!allUploaded && <P dim style={{ marginTop: space.sm, textAlign: 'center' }}>Attach all three documents to continue.</P>}
        </View>
      )}

      {step === 'otp' && (
        <View style={{ marginTop: space.xl }}>
          <H1>Verify your phone</H1>
          <P dim style={{ marginBottom: space.lg }}>Enter the 6-digit code sent to {form.phone}.</P>
          <Field label="Verification code" placeholder="000000" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} error={err} />
          <Button title="Verify & finish" onPress={verify} loading={busy} disabled={code.length !== 6} style={{ marginTop: space.md }} />
        </View>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  li:       { color: colors.textDim, fontFamily: font.regular, fontSize: 14, marginTop: 6 },
  docRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  docLabel: { color: colors.text, fontFamily: font.semi, fontSize: 15 },
  docState: { color: colors.textDim, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  docGlyph: { fontSize: 22, marginLeft: space.md },
});
