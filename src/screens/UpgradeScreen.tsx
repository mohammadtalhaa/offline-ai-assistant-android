import React, { useState } from 'react';
import { Alert, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Screen, Text, Surface, Button, FadeInView } from '../components/ui/kit';
import { ENFORCE_PRO } from '../config';
import { useApp } from '../store/useApp';
import { useTheme, spacing, radii, shadow } from '../theme/theme';

const FREE = [
  'One lightweight AI model',
  'Unlimited offline chat',
  'Local conversation history',
  'Basic writing tools',
  'No account, no cloud',
];

const PRO = [
  'All AI models — Lite to Extreme',
  '7B flagship models for flagship phones',
  'Offline document chat with sources',
  'Longer context windows',
  'Priority response quality',
  'Future model drops included',
  'One-time payment, yours forever',
];

export default function UpgradeScreen() {
  const { c } = useTheme();
  const { pro, buy } = useApp();
  const [busy, setBusy] = useState(false);

  async function purchase() {
    setBusy(true);
    const err = await buy('lifetime');
    setBusy(false);
    Alert.alert(err ? 'Not completed' : 'Welcome to Pro', err ?? 'All features unlocked. Thank you!');
  }

  return (
    <Screen scroll edges={{ top: false, bottom: true }}>
      <View style={{ padding: spacing.xl, paddingBottom: 140 }}>
        <FadeInView delay={0}>
          <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
            <View style={[styles.crown, { backgroundColor: c.surfaceAlt }]}>
              <Feather name="award" size={22} color={c.text} />
            </View>
            <Text variant="title" style={{ marginTop: spacing.md, textAlign: 'center' }}>
              Unlock everything
            </Text>
            <Text variant="body" color="muted" style={{ textAlign: 'center', marginTop: spacing.sm, maxWidth: 300 }}>
              One payment. Lifetime access. No subscriptions.
            </Text>
          </View>
        </FadeInView>

        {/* Free */}
        <FadeInView delay={80}>
          <Surface style={{ marginTop: spacing['2xl'], marginBottom: spacing.md }}>
            <View style={styles.planHeader}>
              <Text variant="heading">Free</Text>
              {!pro && <Text variant="label" color="muted">CURRENT</Text>}
            </View>
            <Text variant="display" style={{ marginTop: spacing.sm }}>Rs 0</Text>
            <Text variant="caption" color="muted" style={{ marginTop: 2 }}>Forever</Text>
            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              {FREE.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Feather name="check" size={15} color={c.textMuted} />
                  <Text variant="body" color="muted" style={{ flex: 1 }}>{f}</Text>
                </View>
              ))}
            </View>
            <Button title="Current plan" variant="ghost" size="sm" fullWidth disabled style={{ marginTop: spacing.lg }} />
          </Surface>
        </FadeInView>

        {/* Pro */}
        <FadeInView delay={160}>
          <View style={[styles.proCard, { backgroundColor: c.surface, borderColor: c.primary }, shadow.lifted]}>
            <View style={styles.planHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text variant="heading">Lifetime Pro</Text>
                <Feather name="star" size={16} color={c.text} />
              </View>
              <View style={[styles.bestBadge, { backgroundColor: c.primary }]}>
                <Text variant="label" style={{ color: c.onPrimary }}>BEST VALUE</Text>
              </View>
            </View>
            <Text variant="display" style={{ marginTop: spacing.sm }}>Rs 2,999</Text>
            <Text variant="caption" color="muted" style={{ marginTop: 2 }}>
              One-time · yours forever · save vs subscriptions
            </Text>
            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              {PRO.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Feather name="check" size={15} color={c.text} />
                  <Text variant="body" style={{ flex: 1 }}>{f}</Text>
                </View>
              ))}
            </View>
            <Button
              title={pro ? 'You own Pro ✓' : 'Upgrade to Pro'}
              fullWidth
              loading={busy}
              disabled={pro}
              icon={pro ? 'check' : 'unlock'}
              onPress={purchase}
              style={{ marginTop: spacing.xl }}
            />
            {!ENFORCE_PRO && (
              <Text variant="caption" color="faint" style={{ textAlign: 'center', marginTop: spacing.md }}>
                Test mode · all features currently unlocked
              </Text>
            )}
          </View>
        </FadeInView>

        <FadeInView delay={240}>
          <Text variant="caption" color="faint" style={{ textAlign: 'center', marginTop: spacing['2xl'] }}>
            Payments through Google Play Billing. Restore anytime from this screen.
          </Text>
        </FadeInView>
      </View>
    </Screen>
  );
}

const styles = require('react-native').StyleSheet.create({
  crown: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  proCard: { borderRadius: 20, borderWidth: 1.5, padding: 20 },
  bestBadge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
});