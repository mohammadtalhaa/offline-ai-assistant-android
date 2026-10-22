import React from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Screen, Text, Surface, Button, FadeInView } from '../components/ui/kit';
import { useTheme, spacing, radii, shadow } from '../theme/theme';

const LINKS = [
  { icon: 'shield' as const, title: 'Privacy Policy', sub: 'How your data is handled', url: 'https://example.com/privacy' },
  { icon: 'file-text' as const, title: 'Terms of Service', sub: 'Usage terms', url: 'https://example.com/terms' },
  { icon: 'github' as const, title: 'Open source', sub: 'Built with React Native & llama.cpp', url: 'https://github.com' },
  { icon: 'mail' as const, title: 'Contact', sub: 'hello@offlineassistant.app', url: 'mailto:hello@offlineassistant.app' },
];

export default function AboutScreen() {
  const { c } = useTheme();
  const nav = useNavigation<any>();

  return (
    <Screen scroll edges={{ top: false, bottom: true }}>
      <View style={{ padding: spacing.xl, paddingBottom: 140 }}>
        <FadeInView delay={0}>
          <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
            <View style={[styles.logo, { backgroundColor: c.surface, borderColor: c.border }, shadow.soft]}>
              <Feather name="feather" size={30} color={c.text} />
            </View>
            <Text variant="title" style={{ marginTop: spacing.lg }}>Offline Assistant</Text>
            <Text variant="caption" color="muted" style={{ marginTop: spacing.xs }}>Version 1.0.0 · Build 100</Text>
            <Text variant="body" color="muted" style={{ textAlign: 'center', marginTop: spacing.lg, maxWidth: 320, lineHeight: 21 }}>
              A private AI assistant that runs entirely on your phone. No cloud, no accounts, no tracking.
            </Text>
          </View>
        </FadeInView>

        <FadeInView delay={80}>
          <Surface padded={false} style={{ marginTop: spacing['2xl'] }}>
            {LINKS.map((l, i) => (
              <Pressable
                key={l.title}
                onPress={() => Linking.openURL(l.url).catch(() => {})}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderBottomWidth: i === LINKS.length - 1 ? 0 : 0.5,
                    borderBottomColor: c.border,
                    opacity: pressed ? 0.6 : 1,
                  },
                ]}
              >
                <View style={[styles.rowIcon, { backgroundColor: c.surfaceAlt }]}>
                  <Feather name={l.icon} size={15} color={c.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{l.title}</Text>
                  <Text variant="caption" color="muted" style={{ marginTop: 2 }}>{l.sub}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={c.textFaint} />
              </Pressable>
            ))}
          </Surface>
        </FadeInView>

        <FadeInView delay={160}>
          <View style={{ marginTop: spacing['2xl'] }}>
            <Text variant="label" color="faint" style={{ marginBottom: spacing.md }}>CREDITS</Text>
            <Surface>
              <Text variant="body" color="muted" style={{ lineHeight: 22 }}>
                Built with React Native, Expo, llama.cpp, and GGUF models from Qwen, Meta, Google, Microsoft, and Mistral.
              </Text>
              <Text variant="caption" color="faint" style={{ marginTop: spacing.md }}>
                All models are used under their respective licenses. Download sizes and licenses are shown in the Models tab.
              </Text>
            </Surface>
          </View>
        </FadeInView>

        <FadeInView delay={240}>
          <View style={{ alignItems: 'center', marginTop: spacing['3xl'] }}>
            <Text variant="caption" color="faint">Made with care · for privacy</Text>
          </View>
        </FadeInView>
      </View>
    </Screen>
  );
}

const styles = require('react-native').StyleSheet.create({
  logo: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 0.5,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 16, paddingHorizontal: 16,
  },
  rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});