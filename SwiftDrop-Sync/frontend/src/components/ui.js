// src/components/ui.js — shared UI primitives
import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  StyleSheet, SafeAreaView, ScrollView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, font, radius, space, statusMeta } from '../theme';

export function Screen({ children, scroll, style, padded = true }) {
  const inner = (
    <View style={[padded && { padding: space.lg }, { flex: scroll ? undefined : 1 }, style]}>
      {children}
    </View>
  );
  return (
    <SafeAreaView style={s.screen}>
      {scroll
        ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>{inner}</ScrollView>
        : inner}
    </SafeAreaView>
  );
}

export function H1({ children, style }) { return <Text style={[s.h1, style]}>{children}</Text>; }
export function H2({ children, style }) { return <Text style={[s.h2, style]}>{children}</Text>; }
export function P({ children, style, dim }) { return <Text style={[s.p, dim && { color: colors.textDim }, style]}>{children}</Text>; }

export function Button({ title, onPress, loading, disabled, variant = 'primary', style }) {
  const isPrimary = variant === 'primary';
  const body = loading
    ? <ActivityIndicator color={isPrimary ? '#04150B' : colors.text} />
    : <Text style={[s.btnTxt, !isPrimary && { color: colors.text }]}>{title}</Text>;
  if (isPrimary) {
    return (
      <TouchableOpacity activeOpacity={0.85} disabled={disabled || loading} onPress={onPress} style={[{ opacity: disabled ? 0.5 : 1 }, style]}>
        <LinearGradient colors={[colors.primary, colors.primaryDk]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btn}>{body}</LinearGradient>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity activeOpacity={0.85} disabled={disabled || loading} onPress={onPress}
      style={[s.btn, s.btnGhost, { opacity: disabled ? 0.5 : 1 }, style]}>{body}</TouchableOpacity>
  );
}

export function Field({ label, error, ...props }) {
  return (
    <View style={{ marginBottom: space.md }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={colors.textDim} style={[s.input, error && { borderColor: colors.danger }]} {...props} />
      {error ? <Text style={s.err}>{error}</Text> : null}
    </View>
  );
}

export function Card({ children, style, onPress }) {
  const Cmp = onPress ? TouchableOpacity : View;
  return <Cmp activeOpacity={0.85} onPress={onPress} style={[s.card, style]}>{children}</Cmp>;
}

export function StatusPill({ status }) {
  const meta = statusMeta[status] || { label: status, color: colors.textDim };
  return (
    <View style={[s.pill, { borderColor: meta.color }]}>
      <View style={[s.dot, { backgroundColor: meta.color }]} />
      <Text style={[s.pillTxt, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

export function Row({ children, style }) { return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>; }
export function Loader({ label }) {
  return <View style={s.loader}><ActivityIndicator color={colors.primary} size="large" />{label ? <Text style={[s.p, { marginTop: 12 }]}>{label}</Text> : null}</View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  h1: { fontFamily: font.displayX, fontSize: 28, color: colors.text, marginBottom: 6 },
  h2: { fontFamily: font.semi, fontSize: 18, color: colors.text, marginBottom: 4 },
  p:  { fontFamily: font.regular, fontSize: 14, color: colors.text, lineHeight: 20 },
  label: { fontFamily: font.medium, fontSize: 13, color: colors.textDim, marginBottom: 6 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 10, color: colors.text, fontFamily: font.regular, fontSize: 15 },
  err: { color: colors.danger, fontSize: 12, marginTop: 4, fontFamily: font.regular },
  btn: { borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  btnTxt: { fontFamily: font.semi, fontSize: 15, color: '#04150B' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg },
  pill: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  pillTxt: { fontSize: 12, fontFamily: font.medium },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
});
