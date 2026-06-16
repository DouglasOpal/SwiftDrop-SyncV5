// src/screens/rider/BankDetailsScreen.js
// FEATURE 8 — riders set their payout bank details properly (10-digit validation).
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, H1, H2, P, Button, Field, Card } from '../../components/ui';
import { riderService } from '../../services/riderService';
import { errMsg } from '../../services/api';
import { colors, font, radius, space } from '../../theme';

// Common Nigerian banks with CBN codes (extend as needed)
const BANKS = [
  { name: 'Access Bank', code: '044' }, { name: 'GTBank', code: '058' },
  { name: 'Zenith Bank', code: '057' }, { name: 'First Bank', code: '011' },
  { name: 'UBA', code: '033' }, { name: 'Fidelity Bank', code: '070' },
  { name: 'Union Bank', code: '032' }, { name: 'Sterling Bank', code: '232' },
  { name: 'Kuda', code: '50211' }, { name: 'Opay', code: '999992' }, { name: 'Moniepoint', code: '50515' },
];

export default function BankDetailsScreen({ navigation }) {
  const [bankName, setBankName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [existing, setExisting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr]   = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await riderService.getBank();
        if (data.bankAccount) {
          const b = data.bankAccount; setExisting(b);
          setBankName(b.bankName || ''); setBankCode(b.bankCode || '');
          setAccountName(b.accountName || ''); setAccountNumber(b.accountNumber || '');
        }
      } catch {}
    })();
  }, []);

  function pickBank(b) { setBankName(b.name); setBankCode(b.code); }

  async function save() {
    setBusy(true); setErr(null); setDone(false);
    try {
      await riderService.setBank({ bankName, accountName, accountNumber, bankCode });
      setDone(true);
      setTimeout(() => navigation.goBack(), 700);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  }

  const numOk = /^\d{10}$/.test(accountNumber.trim());

  return (
    <Screen scroll>
      <H1>Payout bank details</H1>
      <P dim style={{ marginBottom: space.lg }}>
        {existing?.isVerified ? 'Your account is verified.' : 'Enter the account where you\'d like your earnings paid.'}
      </P>

      <H2>Select your bank</H2>
      <View style={st.bankWrap}>
        {BANKS.map((b) => (
          <Text key={b.code} onPress={() => pickBank(b)} style={[st.bankChip, bankName === b.name && st.bankChipOn]}>{b.name}</Text>
        ))}
      </View>

      <Field label="Bank name" placeholder="Selected bank" value={bankName} onChangeText={setBankName} style={{ marginTop: space.md }} />
      <Field label="Account number" placeholder="0123456789" keyboardType="number-pad" maxLength={10} value={accountNumber} onChangeText={setAccountNumber} />
      {accountNumber.length > 0 && !numOk && <Text style={st.hint}>Account number must be exactly 10 digits.</Text>}
      <Field label="Account name" placeholder="As it appears at your bank" value={accountName} onChangeText={setAccountName} error={err} />

      {done && <P style={{ color: colors.primary, marginTop: space.sm }}>Saved ✓</P>}
      <Button title={existing ? 'Update bank details' : 'Save bank details'} onPress={save} loading={busy}
        disabled={!bankName.trim() || !accountName.trim() || !numOk} style={{ marginTop: space.md }} />
    </Screen>
  );
}

const st = StyleSheet.create({
  bankWrap:   { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  bankChip:   { color: colors.textDim, fontFamily: font.medium, fontSize: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, overflow: 'hidden' },
  bankChipOn: { color: '#04150B', backgroundColor: colors.primary, borderColor: colors.primary },
  hint:       { color: colors.danger, fontFamily: font.regular, fontSize: 12, marginTop: -space.sm, marginBottom: space.sm },
});
