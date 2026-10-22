import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen, Text, ListRow, Surface, FadeInView } from '../components/ui/kit';
import { listConversations, listDocuments } from '../services/database/db';
import { getModel } from '../features/model-manager/catalog';
import { useApp } from '../store/useApp';
import { useTheme, spacing, radii, shadow } from '../theme/theme';
import { formatBytes } from '../utils/format';
import type { Language } from '../types';
import type { RootStackParams } from '../navigation/types';

/* ------------------------------ constants ------------------------------ */

const LANGS: { id: Language; label: string; sub?: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'ur', label: 'اردو', sub: 'Urdu' },
  { id: 'ur-roman', label: 'Roman Urdu', sub: 'Urdu in English letters' },
];

const THEMES: { id: 'system' | 'light' | 'dark'; label: string; sub?: string }[] = [
  { id: 'system', label: 'System', sub: 'Match your phone' },
  { id: 'light', label: 'Light', sub: 'Warm paper' },
  { id: 'dark', label: 'Dark', sub: 'Deep ink' },
];

type Nav = NativeStackNavigationProp<RootStackParams>;

/* ------------------------------- screen -------------------------------- */

export default function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const { c } = useTheme();

  // Granular selectors — the screen only re-renders when these change
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const unloadModel = useApp((s) => s.unloadModel);
  const deleteAllData = useApp((s) => s.deleteAllData);
  const clearCache = useApp((s) => s.clearCache);
  const pro = useApp((s) => s.pro);
  const freeBytes = useApp((s) => s.freeBytes);
  const loadedModelId = useApp((s) => s.loadedModelId);
  const refreshModels = useApp((s) => s.refreshModels);
  const activeModelId = useApp((s) => s.settings.activeModelId);

  const [counts, setCounts] = useState({ chats: 0, docs: 0 });
  const [picker, setPicker] = useState<'lang' | 'theme' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const actingRef = useRef(false);

  /* --------------------------- data loading --------------------------- */

  const refreshCounts = useCallback(async () => {
    try {
      const [convs, docs] = await Promise.all([
        listConversations(),
        listDocuments(),
      ]);
      if (mountedRef.current) {
        setCounts({ chats: convs.length, docs: docs.length });
      }
    } catch {
      /* ignore — counts are non-critical */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      refreshCounts();
      refreshModels();
      return () => {
        mountedRef.current = false;
      };
    }, [refreshCounts, refreshModels]),
  );

  /* ---------------------------- derivations ---------------------------- */

  const activeModel = getModel(activeModelId);
  const modelLoaded = !!loadedModelId && loadedModelId === activeModelId;

  const currentLang =
    LANGS.find((l) => l.id === settings.language) ?? LANGS[0];
  const currentTheme =
    THEMES.find((t) => t.id === settings.theme) ?? THEMES[0];

  const modelSubtitle = activeModel
    ? `${activeModel.name}${modelLoaded ? ' · loaded' : ''}`
    : 'No model installed — tap to choose';

  /* ------------------------------ actions ------------------------------ */

  const runOnce = useCallback(
    async (key: string, fn: () => Promise<void> | void) => {
      if (actingRef.current) return;
      actingRef.current = true;
      setBusy(key);
      try {
        await fn();
      } catch (e) {
        if (mountedRef.current) {
          Alert.alert('Something went wrong', (e as Error).message);
        }
      } finally {
        actingRef.current = false;
        if (mountedRef.current) setBusy(null);
      }
    },
    [],
  );

  const onClearCache = useCallback(
    () =>
      runOnce('cache', () =>
        new Promise<void>((resolve) => {
          Alert.alert(
            'Clear cache?',
            'Frees model memory and speed data. Your chats, documents, and memories are kept.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
              {
                text: 'Clear',
                onPress: async () => {
                  // clearCache() already unloads the engine internally.
                  await clearCache();
                  await refreshModels();
                  if (mountedRef.current) {
                    Alert.alert('Done', 'Cache cleared.');
                  }
                  resolve();
                },
              },
            ],
          );
        }),
      ),
    [runOnce, clearCache, refreshModels],
  );

  const onDeleteAll = useCallback(
    () =>
      runOnce('delete', () =>
        new Promise<void>((resolve) => {
          Alert.alert(
            'Delete everything?',
            'All conversations, documents, and saved memory will be permanently erased. This cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
              {
                text: 'Delete everything',
                style: 'destructive',
                onPress: async () => {
                  await deleteAllData();
                  await Promise.all([refreshCounts(), refreshModels()]);
                  if (mountedRef.current) {
                    Alert.alert('Done', 'All local data has been deleted.');
                  }
                  resolve();
                },
              },
            ],
          );
        }),
      ),
    [runOnce, deleteAllData, refreshCounts, refreshModels],
  );

  const onFreeMemory = useCallback(
    () =>
      runOnce('unload', async () => {
        await unloadModel();
        if (mountedRef.current) {
          Alert.alert('Done', 'Model unloaded. It will reload on next use.');
        }
      }),
    [runOnce, unloadModel],
  );

  const pickLanguage = useCallback(
    async (id: Language) => {
      setPicker(null);
      await setSettings({ language: id });
    },
    [setSettings],
  );

  const pickTheme = useCallback(
    async (id: 'system' | 'light' | 'dark') => {
      setPicker(null);
      await setSettings({ theme: id });
    },
    [setSettings],
  );

  /* ------------------------------- render ------------------------------ */

  const isBusy = busy !== null;

  return (
    <Screen scroll edges={{ top: true, bottom: true }}>
      <View style={{ paddingBottom: 160 }}>
        <Text
          variant="display"
          style={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: spacing['2xl'],
          }}
        >
          Settings
        </Text>

        {/* ---------------------------- Preferences ---------------------------- */}
        <FadeInView delay={0}>
          <Surface
            padded={false}
            style={{ marginHorizontal: spacing.xl, marginBottom: spacing.lg }}
          >
            <ListRow
              icon="cpu"
              title="AI Model"
              subtitle={modelSubtitle}
              onPress={() => nav.navigate('Tabs', { screen: 'Models' })}
            />
            <ListRow
              icon="globe"
              title="Language"
              subtitle={
                currentLang.sub
                  ? `${currentLang.label} · ${currentLang.sub}`
                  : currentLang.label
              }
              onPress={() => setPicker('lang')}
            />
            <ListRow
              icon="sun"
              title="Appearance"
              subtitle={
                currentTheme.sub
                  ? `${currentTheme.label} · ${currentTheme.sub}`
                  : currentTheme.label
              }
              onPress={() => setPicker('theme')}
            />
            <ListRow
              icon="wifi-off"
              title="Download on Wi-Fi only"
              subtitle="Save mobile data"
              right={
                <Switch
                  value={settings.wifiOnly}
                  onValueChange={(v) => setSettings({ wifiOnly: v })}
                  trackColor={{ true: c.success, false: c.border }}
                  thumbColor="#FFF"
                  accessibilityLabel="Download models on Wi-Fi only"
                />
              }
            />
            <ListRow
              icon="save"
              title="Remember across chats"
              subtitle="Save facts locally"
              right={
                <Switch
                  value={settings.useMemory}
                  onValueChange={(v) => setSettings({ useMemory: v })}
                  trackColor={{ true: c.success, false: c.border }}
                  thumbColor="#FFF"
                  accessibilityLabel="Remember facts across chats"
                />
              }
              last
            />
          </Surface>
        </FadeInView>

        {/* ------------------------------ Account ------------------------------ */}
        <FadeInView delay={60}>
          <Surface
            padded={false}
            style={{ marginHorizontal: spacing.xl, marginBottom: spacing.lg }}
          >
            <ListRow
              icon="star"
              title={pro ? 'Pro active' : 'Upgrade to Pro'}
              subtitle={
                pro
                  ? 'Lifetime · all features unlocked'
                  : 'Unlock advanced models and features'
              }
              onPress={() => nav.navigate('Upgrade')}
            />
            <ListRow
              icon="database"
              title="Memory"
              subtitle="Manage what the AI remembers"
              onPress={() => nav.navigate('Memory')}
            />
            <ListRow
              icon="info"
              title="About"
              subtitle="Version, privacy, credits"
              onPress={() => nav.navigate('About')}
              last
            />
          </Surface>
        </FadeInView>

        {/* ------------------------------ Storage ------------------------------ */}
        <FadeInView delay={120}>
          <Text
            variant="label"
            color="faint"
            style={{
              paddingHorizontal: spacing.xl,
              marginBottom: spacing.sm,
            }}
          >
            STORAGE
          </Text>
          <Surface
            padded={false}
            style={{ marginHorizontal: spacing.xl, marginBottom: spacing.lg }}
          >
            <ListRow
              icon="message-square"
              title="Conversations"
              subtitle={
                counts.chats === 1
                  ? '1 chat stored locally'
                  : `${counts.chats} chats stored locally`
              }
            />
            <ListRow
              icon="file-text"
              title="Documents"
              subtitle={
                counts.docs === 1
                  ? '1 file indexed'
                  : `${counts.docs} files indexed`
              }
            />
            <ListRow
              icon="server"
              title="Free space"
              subtitle={freeBytes > 0 ? formatBytes(freeBytes) : 'Calculating…'}
              last
            />
          </Surface>
        </FadeInView>

        {/* ------------------------------- Danger ------------------------------- */}
        <FadeInView delay={180}>
          <Text
            variant="label"
            color="faint"
            style={{
              paddingHorizontal: spacing.xl,
              marginBottom: spacing.sm,
            }}
          >
            MAINTENANCE
          </Text>
          <Surface
            padded={false}
            style={{ marginHorizontal: spacing.xl, marginBottom: spacing.lg }}
          >
            <ListRow
              icon="zap-off"
              title="Free memory now"
              subtitle="Unload the model from RAM"
              onPress={onFreeMemory}
            />
            <ListRow
              icon="refresh-cw"
              title="Clear cache"
              subtitle="Free up memory (keeps your data)"
              onPress={onClearCache}
            />
            <ListRow
              icon="alert-triangle"
              title="Delete all data"
              subtitle="Chats, documents, and memories"
              onPress={onDeleteAll}
              last
            />
          </Surface>
        </FadeInView>

        <Text
          variant="caption"
          color="faint"
          style={{ textAlign: 'center', marginTop: spacing['2xl'] }}
        >
          Your data. Your control.
        </Text>
      </View>

      {/* ---------------------------- Pickers ---------------------------- */}

      <Modal
        visible={picker === 'lang'}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: c.surface, borderColor: c.border },
              shadow.lifted,
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text variant="heading" style={{ marginBottom: spacing.lg }}>
              Language
            </Text>
            {LANGS.map((l, i) => {
              const selected = settings.language === l.id;
              return (
                <Pressable
                  key={l.id}
                  onPress={() => pickLanguage(l.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.sheetRow,
                    i < LANGS.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: c.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{l.label}</Text>
                    {l.sub && (
                      <Text
                        variant="caption"
                        color="muted"
                        style={{ marginTop: 2 }}
                      >
                        {l.sub}
                      </Text>
                    )}
                  </View>
                  {selected && (
                    <Feather name="check" size={18} color={c.text} />
                  )}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={picker === 'theme'}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: c.surface, borderColor: c.border },
              shadow.lifted,
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text variant="heading" style={{ marginBottom: spacing.lg }}>
              Appearance
            </Text>
            {THEMES.map((t, i) => {
              const selected = settings.theme === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => pickTheme(t.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.sheetRow,
                    i < THEMES.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: c.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{t.label}</Text>
                    {t.sub && (
                      <Text
                        variant="caption"
                        color="muted"
                        style={{ marginTop: 2 }}
                      >
                        {t.sub}
                      </Text>
                    )}
                  </View>
                  {selected && (
                    <Feather name="check" size={18} color={c.text} />
                  )}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* -------------------------- Busy overlay -------------------------- */}
      {isBusy && (
        <View style={styles.busyOverlay} pointerEvents="auto">
          <View
            style={[
              styles.busyCard,
              { backgroundColor: c.surface, borderColor: c.border },
              shadow.lifted,
            ]}
          >
            <ActivityIndicator color={c.text} />
            <Text variant="caption" color="muted" style={{ marginTop: spacing.sm }}>
              Working…
            </Text>
          </View>
        </View>
      )}
    </Screen>
  );
}

/* ------------------------------- styles -------------------------------- */

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,15,8,0.45)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  sheet: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,15,8,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  busyCard: {
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing['3xl'],
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    minWidth: 160,
  },
});