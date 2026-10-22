import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../theme/theme';

interface GlassCardProps {
  children: React.ReactNode;
  intensity?: number;
  style?: StyleProp<ViewStyle>;
}

export function GlassCard({ children, intensity = 40, style }: GlassCardProps) {
  const { c, dark } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <BlurView
        intensity={intensity}
        tint={dark ? 'dark' : 'light'}
        style={styles.blur}
      >
        <View style={[styles.inner, { backgroundColor: dark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)' }]}>
          {children}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 12,
  },
  blur: {
    padding: 1, // tiny padding so the blur wraps the border
  },
  inner: {
    padding: 16,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
});