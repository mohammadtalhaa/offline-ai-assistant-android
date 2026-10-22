import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen, Text, FadeInView } from '../components/ui/kit';
import { Avatar } from '../components/Avatar';
import { ProfileModal } from '../components/ProfileModal';
import { getModel } from '../features/model-manager/catalog';
import {
  deleteConversation,
  listConversations,
  loadProfile,
  renameConversation,
  setArchived,
  touchProfile,
} from '../services/database/db';
import { useApp } from '../store/useApp';
import { useTheme, spacing, radii, shadow } from '../theme/theme';
import type { Conversation, Language, Profile } from '../types';
import { DEFAULT_PROFILE, LANGUAGE_LABELS } from '../types';
import type { RootStackParams } from '../navigation/types';

/* ------------------------------ constants ------------------------------ */

type Nav = NativeStackNavigationProp<RootStackParams>;

const RECENT_LIMIT = 5;

const LANGUAGE_ORDER: Language[] = ['en', 'ur', 'ur-roman'];

interface ToolItem {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  sub: string;
  preset: string;
  prompt: string;
  useDocs?: boolean;
}

const TOOLS: ToolItem[] = [
  {
    icon: 'edit-2',
    label: 'Write',
    sub: 'Draft, improve, rewrite',
    preset: 'writer',
    prompt: 'Rewrite this to sound more professional:\n\n',
  },
  {
    icon: 'file-text',
    label: 'Summarize',
    sub: 'Long text into key points',
    preset: 'summarizer',
    prompt: 'Summarize the following:\n\n',
  },
  {
    icon: 'zap',
    label: 'Brainstorm',
    sub: 'Ideas and quick answers',
    preset: 'general',
    prompt: 'Brainstorm ideas for: ',
  },
  {
    icon: 'book-open',
    label: 'Tutor',
    sub: 'Step-by-step explanations',
    preset: 'tutor',
    prompt: 'Explain in simple terms: ',
  },
  {
    icon: 'globe',
    label: 'Translate',
    sub: 'English, Urdu, Roman Urdu',
    preset: 'translator',
    prompt: 'Translate to Urdu:\n\n',
  },
  {
    icon: 'message-circle',
    label: 'Ask docs',
    sub: 'Answers with sources',
    preset: 'general',
    prompt: '',
    useDocs: true,
  },
];

/* ------------------------------- screen -------------------------------- */

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const { c } = useTheme();

  // Granular store subscriptions — the screen only re-renders when these change
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const models = useApp((s) => s.models);
  const engineName = useApp((s) => s.engineName);

  const [menu, setMenu] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [recent, setRecent] = useState<Conversation[]>([]);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const mountedRef = useRef(true);
  const navigatingRef = useRef(false);

  /* ----------------------------- data load ----------------------------- */

  const refresh = useCallback(async () => {
    try {
      const [convs, prof] = await Promise.all([
        listConversations().catch(() => [] as Conversation[]),
        loadProfile().catch(() => DEFAULT_PROFILE),
      ]);
      if (!mountedRef.current) return;
      setRecent(convs.slice(0, RECENT_LIMIT));
      setProfile(prof ?? DEFAULT_PROFILE);
      setLoaded(true);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[Home] refresh failed', e);
      if (mountedRef.current) setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      // Fire-and-forget: touch the profile so firstUsedAt/lastActiveAt stay accurate
      touchProfile().catch(() => {});
      refresh();
      return () => {
        mountedRef.current = false;
      };
    }, [refresh]),
  );

  const onPullRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [refresh, refreshing]);

  /* -------------------------- safe navigation -------------------------- */

  const go = useCallback((fn: () => void) => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    try {
      fn();
    } finally {
      setTimeout(() => {
        navigatingRef.current = false;
      }, 500);
    }
  }, []);

  /* ---------------------------- derived state -------------------------- */

  const active = useMemo(
    () => getModel(settings.activeModelId),
    [settings.activeModelId],
  );
  const ready = !!(active && models[active.id]?.status === 'ready');
  const demo = engineName.startsWith('Demo');

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const currentLang = useMemo(
    () => LANGUAGE_LABELS[settings.language] ?? LANGUAGE_LABELS.en,
    [settings.language],
  );

  const safeName = useMemo(
    () => (profile?.name ?? '').trim(),
    [profile?.name],
  );
  const firstName = useMemo(
    () => (safeName ? safeName.split(/\s+/)[0] : ''),
    [safeName],
  );

  /* ----------------------- conversation actions ------------------------ */

  const onConversationLongPress = useCallback(
    (cv: Conversation) => {
      Alert.alert(cv.title || 'Conversation', undefined, [
        {
          text: 'Rename',
          onPress: () => {
            if (!Alert.prompt) {
              Alert.alert(
                'Rename not available',
                'Renaming conversations is available on iOS. On Android, delete and start a new chat to change the title.',
              );
              return;
            }
            Alert.prompt(
              'Rename conversation',
              undefined,
              async (text) => {
                const next = (text ?? '').trim();
                if (!next) return;
                try {
                  await renameConversation(cv.id, next);
                  await refresh();
                } catch (e) {
                  Alert.alert('Could not rename', (e as Error).message);
                }
              },
              'plain-text',
              cv.title,
            );
          },
        },
        {
          text: 'Archive',
          onPress: async () => {
            try {
              await setArchived(cv.id, true);
              await refresh();
            } catch (e) {
              Alert.alert('Could not archive', (e as Error).message);
            }
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete conversation?',
              `"${cv.title || 'Untitled'}" will be permanently removed.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteConversation(cv.id);
                      await refresh();
                    } catch (e) {
                      Alert.alert('Could not delete', (e as Error).message);
                    }
                  },
                },
              ],
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [refresh],
  );

  /* ------------------------------- render ------------------------------ */

  return (
    <Screen edges={{ top: true, bottom: false }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 180 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor={c.textMuted}
            colors={[c.primary]}
          />
        }
      >
        {/* ----------------------------- Header --------------------------- */}
        <View style={styles.header}>
          <Pressable
            onPress={() => setProfileOpen(true)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={
              safeName ? `Open profile for ${safeName}` : 'Open your profile'
            }
            style={styles.iconBtn}
          >
            <Avatar
              name={safeName}
              uri={profile.avatarUri ?? null}
              size={38}
            />
          </Pressable>

          <Pressable
            onPress={() =>
              go(() => nav.navigate('Tabs', { screen: 'Settings' }))
            }
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            style={styles.iconBtn}
          >
            <Feather name="settings" size={20} color={c.text} />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: spacing.xl }}>
          {/* -------------------------- Greeting -------------------------- */}
          <FadeInView delay={0}>
            <Text
              variant="body"
              color="muted"
              style={{ textAlign: 'center' }}
            >
              {firstName ? `Hello, ${firstName}` : greeting}
            </Text>
            <Text
              variant="title"
              style={{ textAlign: 'center', marginTop: spacing.sm }}
            >
              How can I help you today?
            </Text>
          </FadeInView>

          {/* ------------------------ Language pill ----------------------- */}
          <FadeInView delay={60}>
            <Pressable
              onPress={() => setMenu(true)}
              style={[
                styles.langPill,
                { backgroundColor: c.surface, borderColor: c.border },
                shadow.soft,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Language: ${currentLang.label}. Tap to change.`}
            >
              <Feather name="globe" size={13} color={c.textMuted} />
              <Text
                variant="caption"
                color="muted"
                style={{ marginLeft: 6, flex: 1 }}
              >
                {currentLang.label} · {currentLang.sub}
              </Text>
              <Feather name="chevron-down" size={14} color={c.textFaint} />
            </Pressable>
          </FadeInView>

          {/* ------------------------- Input pill ------------------------- */}
          <FadeInView delay={120}>
            <Pressable
              onPress={() => go(() => nav.navigate('Chat'))}
              style={[
                styles.inputPill,
                { backgroundColor: c.surface, borderColor: c.border },
                shadow.soft,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Start a new chat"
            >
              <Text variant="body" color="faint" style={{ flex: 1 }}>
                Ask anything...
              </Text>
              <View style={[styles.sendBtn, { backgroundColor: c.primary }]}>
                <Feather name="arrow-up" size={16} color={c.onPrimary} />
              </View>
            </Pressable>
          </FadeInView>

          {/* --------------------------- Tool grid ------------------------ */}
          <FadeInView delay={200}>
            <Text
              variant="label"
              color="faint"
              style={{ marginTop: spacing['3xl'], marginBottom: spacing.md }}
            >
              TOOLS
            </Text>
            <View style={styles.grid}>
              {TOOLS.map((a) => (
                <Pressable
                  key={a.label}
                  onPress={() =>
                    go(() =>
                      a.useDocs
                        ? nav.navigate('Chat', { useDocs: true })
                        : nav.navigate('Chat', {
                            presetId: a.preset,
                            prompt: a.prompt,
                          }),
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`${a.label}. ${a.sub}`}
                  style={({ pressed }) => [
                    styles.tile,
                    {
                      backgroundColor: c.surface,
                      borderColor: c.border,
                      opacity: pressed ? 0.75 : 1,
                      transform: [{ scale: pressed ? 0.985 : 1 }],
                    },
                    shadow.soft,
                  ]}
                >
                  <View
                    style={[
                      styles.tileIcon,
                      { backgroundColor: c.surfaceAlt },
                    ]}
                  >
                    <Feather name={a.icon} size={16} color={c.text} />
                  </View>
                  <Text
                    variant="bodyStrong"
                    style={{ marginTop: spacing.md, letterSpacing: 0.2 }}
                  >
                    {a.label}
                  </Text>
                  <Text
                    variant="caption"
                    color="muted"
                    numberOfLines={2}
                    style={{ marginTop: 2 }}
                  >
                    {a.sub}
                  </Text>
                </Pressable>
              ))}
            </View>
          </FadeInView>

          {/* -------------------- Recent conversations -------------------- */}
          <FadeInView delay={300}>
            <View style={styles.recentHeader}>
              <Text variant="label" color="faint">
                RECENT
              </Text>
              {recent.length > 0 && (
                <Pressable
                  onPress={() =>
                    go(() => nav.navigate('Tabs', { screen: 'Documents' }))
                  }
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="See all conversations"
                >
                  <Text variant="caption" color="muted">
                    See all
                  </Text>
                </Pressable>
              )}
            </View>

            {recent.length === 0 && loaded ? (
              <View style={styles.emptyRecent}>
                <Feather name="inbox" size={22} color={c.textFaint} />
                <Text
                  variant="caption"
                  color="faint"
                  style={{ marginTop: spacing.sm, textAlign: 'center' }}
                >
                  No conversations yet. Ask something to begin.
                </Text>
              </View>
            ) : (
              recent.map((cv) => (
                <Pressable
                  key={cv.id}
                  onPress={() =>
                    go(() =>
                      nav.navigate('Chat', { conversationId: cv.id }),
                    )
                  }
                  onLongPress={() => onConversationLongPress(cv)}
                  delayLongPress={400}
                  accessibilityRole="button"
                  accessibilityLabel={`Open conversation: ${
                    cv.title || 'Untitled'
                  }`}
                  accessibilityHint="Long-press for options"
                  style={({ pressed }) => [
                    styles.recentRow,
                    {
                      borderBottomColor: c.border,
                      opacity: pressed ? 0.6 : 1,
                    },
                  ]}
                >
                  <Feather
                    name="message-circle"
                    size={16}
                    color={c.textMuted}
                  />
                  <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                    {cv.title || 'Untitled'}
                  </Text>
                  <Feather
                    name="chevron-right"
                    size={16}
                    color={c.textFaint}
                  />
                </Pressable>
              ))
            )}
          </FadeInView>

          {/* ---------------------- Model status card ---------------------- */}
          <FadeInView delay={380}>
            <Pressable
              onPress={() =>
                go(() => nav.navigate('Tabs', { screen: 'Models' }))
              }
              accessibilityRole="button"
              accessibilityLabel={
                ready
                  ? `${active?.name} ready. Tap to manage.`
                  : 'No model installed. Tap to download.'
              }
              style={[
                styles.statusCard,
                { backgroundColor: c.surface, borderColor: c.border },
                shadow.soft,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: ready
                      ? '#6BAA75'
                      : demo
                      ? c.accent
                      : c.textFaint,
                  },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {demo
                    ? 'Demo mode'
                    : ready
                    ? active?.name
                    : 'No model installed'}
                </Text>
                <Text
                  variant="caption"
                  color="muted"
                  style={{ marginTop: 2 }}
                  numberOfLines={2}
                >
                  {demo
                    ? 'Build with expo run:android for real inference'
                    : ready
                    ? 'Ready to work offline · tap to manage'
                    : 'Tap to download a model'}
                </Text>
              </View>
              <Feather
                name="chevron-right"
                size={16}
                color={c.textFaint}
              />
            </Pressable>
          </FadeInView>

          <Text
            variant="caption"
            color="faint"
            style={{
              textAlign: 'center',
              marginTop: spacing['3xl'],
              letterSpacing: 0.3,
            }}
          >
            Everything runs on your device.
          </Text>
        </View>
      </ScrollView>

      {/* ------------------------ Profile modal ------------------------- */}
      <ProfileModal
        visible={profileOpen}
        onClose={() => {
          setProfileOpen(false);
          setTimeout(() => {
            if (mountedRef.current) refresh();
          }, 80);
        }}
      />

      {/* ------------------------ Language picker ----------------------- */}
      <Modal
        visible={menu}
        transparent
        animationType="fade"
        onRequestClose={() => setMenu(false)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setMenu(false)}
        >
          <Pressable
            style={[
              styles.menuPanel,
              { backgroundColor: c.surface, borderColor: c.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text variant="heading" style={{ marginBottom: spacing.lg }}>
              Language
            </Text>
            {LANGUAGE_ORDER.map((id) => {
              const l = LANGUAGE_LABELS[id];
              const selected = settings.language === id;
              return (
                <Pressable
                  key={id}
                  onPress={async () => {
                    setMenu(false);
                    try {
                      await setSettings({ language: id });
                    } catch {
                      /* ignore — settings retries on next tap */
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.menuRow, { borderBottomColor: c.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{l.label}</Text>
                    <Text
                      variant="caption"
                      color="muted"
                      style={{ marginTop: 2 }}
                    >
                      {l.sub}
                    </Text>
                  </View>
                  {selected && (
                    <Feather name="check" size={18} color={c.text} />
                  )}
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => {
                setMenu(false);
                go(() => nav.navigate('Tabs', { screen: 'Settings' }));
              }}
              accessibilityRole="button"
              style={[styles.menuRow, { borderBottomColor: 'transparent' }]}
            >
              <Feather name="settings" size={16} color={c.text} />
              <Text
                variant="body"
                style={{ marginLeft: spacing.md, flex: 1 }}
              >
                All settings
              </Text>
              <Feather name="chevron-right" size={16} color={c.textFaint} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

/* ------------------------------- styles -------------------------------- */

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: spacing.lg,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 200,
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing['2xl'],
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: spacing.xl,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 52,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tile: {
    width: '48%',
    aspectRatio: 1.15,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing['3xl'],
    marginBottom: spacing.md,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emptyRecent: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing['3xl'],
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  menuPanel: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    ...shadow.lifted,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});