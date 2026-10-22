import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../theme/theme';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
}

export function H({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return <Text style={[styles.h, { color: c.text }, style]}>{children}</Text>;
}

export function P({ children, style, sub }: { children: React.ReactNode; style?: StyleProp<TextStyle>; sub?: boolean }) {
  const { c } = useTheme();
  return <Text style={[{ color: sub ? c.sub : c.text, fontSize: 14, lineHeight: 20 }, style]}>{children}</Text>;
}

interface BtnProps {
  title: string;
  onPress?: () => void;
  kind?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Btn({ title, onPress, kind = 'primary', disabled, loading, small, style }: BtnProps) {
  const { c } = useTheme();
  const bg = kind === 'primary' ? c.primary : 'transparent';
  const color = kind === 'primary' ? c.onPrimary : kind === 'danger' ? c.danger : c.primary;
  const border = kind === 'primary' ? c.primary : kind === 'danger' ? c.danger : c.border;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={color} /> : <Text style={{ color, fontWeight: '600', fontSize: small ? 13 : 15 }}>{title}</Text>}
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={[styles.chip, { borderColor: active ? c.primary : c.border, backgroundColor: active ? c.primary : 'transparent' }]}
    >
      <Text style={{ color: active ? c.onPrimary : c.text, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, marginBottom: 12 },
  h: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  btn: { borderWidth: 1, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10 },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
});
