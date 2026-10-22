import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FS from 'expo-file-system/legacy';
import { Text, Button } from './ui/kit';
import { Avatar } from './Avatar';
import {
  getProfileStats,
  loadProfile,
  saveProfile,
} from '../services/database/db';
import { useApp } from '../store/useApp';
import { useTheme, spacing, radii, shadow } from '../theme/theme';
import type {
  ExpertiseLevel,
  Profile,
  ResponseStyle,
  TonePreference,
} from '../types';
import { DEFAULT_PROFILE } from '../types';
import { generateBio } from '../features/profile/profileService';
import { formatDate } from '../utils/format';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const AVATAR_DIR = `${FS.documentDirectory}profile/`;

/* ------------------------------ helpers ------------------------------ */

async function persistAvatar(uri: string): Promise<string> {
  try {
    const dir = await FS.getInfoAsync(AVATAR_DIR);
    if (!dir.exists) await FS.makeDirectoryAsync(AVATAR_DIR, { intermediates: true });
    const target = `${AVATAR_DIR}avatar-${Date.now()}.jpg`;
    await FS.copyAsync({ from: uri, to: target });
    return target;
  } catch {
    return uri; // fall back to the temp URI
  }
}

async function deleteAvatarFile(uri: string | null): Promise<void> {
  if (!uri || !uri.includes(AVATAR_DIR)) return;
  try {
    await FS.deleteAsync(uri, { idempotent: true });
  } catch {
    /* ignore */
  }
}

const RESPONSE_STYLES: { id: ResponseStyle; label: string; sub: string }[] = [
  { id: 'concise', label: 'Concise', sub: 'Short, to the point' },
  { id: 'balanced', label: 'Balanced', sub: 'Clear but complete' },
  { id: 'detailed', label: 'Detailed', sub: 'Thorough with examples' },
];

const TONES: { id: TonePreference; label: string; sub: string }[] = [
  { id: 'friendly', label: 'Friendly', sub: 'Warm and encouraging' },
  { id: 'professional', label: 'Professional', sub: 'Neutral and precise' },
  { id: 'casual', label: 'Casual', sub: 'Relaxed and informal' },
];

const EXPERTISE: { id: ExpertiseLevel; label: string; sub: string }[] = [
  { id: 'beginner', label: 'Beginner', sub: 'Avoid jargon' },
  { id: 'intermediate', label: 'Intermediate', sub: 'Standard depth' },
  { id: 'expert', label: 'Expert', sub: 'Skip the basics' },
];

/* ------------------------------- modal ------------------------------- */

export function ProfileModal({ visible, onClose }: Props) {
  const { c } = useTheme();
  const engineName = useApp((s) => s.engineName);
  const activeModelId = useApp((s) => s.settings.activeModelId);

  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [live, setLive] = useState({ conversations: 0, messages: 0, documents: 0 });
  const [editing, setEditing] = useState<'name' | 'occupation' | 'location' | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState<'bio' | 'prefs'>('bio');
  const mountedRef = useRef(true);

  const demo = engineName.startsWith('Demo');
  const hasModel = !!activeModelId;

  /* --------------- load profile + live stats on open --------------- */

  const refresh = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([loadProfile(), getProfileStats()]);
      if (!mountedRef.current) return;
      setProfile(p);
      setLive(s);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* ------------------------ persistence helper --------------------- */

  const commit = useCallback(
    async (patch: Partial<Profile>) => {
      const next = { ...profile, ...patch };
      setProfile(next);
      try {
        await saveProfile(next);
      } catch {
        /* ignore */
      }
    },
    [profile],
  );

  /* -------------------------- avatar actions ----------------------- */

  const pickAvatar = useCallback(
    async (source: 'camera' | 'library') => {
      try {
        let result: ImagePicker.ImagePickerResult;
        if (source === 'camera') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Camera permission needed');
            return;
          }
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            allowsEditing: true,
            aspect: [1, 1],
          });
        } else {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Photo access needed');
            return;
          }
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            allowsEditing: true,
            aspect: [1, 1],
          });
        }
        if (result.canceled || !result.assets?.length) return;
        const asset = result.assets[0];

        setBusy(true);
        const persisted = await persistAvatar(asset.uri);
        const previous = profile.avatarUri;
        await commit({ avatarUri: persisted });
        // Clean up old file if it was inside our managed dir
        if (previous && previous !== persisted) {
          await deleteAvatarFile(previous);
        }
      } catch (e) {
        Alert.alert('Could not update avatar', (e as Error).message);
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [profile.avatarUri, commit],
  );

  const removeAvatar = useCallback(async () => {
    const previous = profile.avatarUri;
    await commit({ avatarUri: null });
    await deleteAvatarFile(previous);
  }, [profile.avatarUri, commit]);

  /* --------------------------- edit fields ------------------------- */

  const startEditing = useCallback(
    (field: 'name' | 'occupation' | 'location', value: string) => {
      setEditing(field);
      setDraft(value);
    },
    [],
  );

  const commitEditing = useCallback(async () => {
    if (!editing) return;
    const trimmed = draft.trim();
    const patch: Partial<Profile> = { [editing]: trimmed } as Partial<Profile>;
    setEditing(null);
    setDraft('');
    await commit(patch);
  }, [editing, draft, commit]);

  const cancelEditing = useCallback(() => {
    setEditing(null);
    setDraft('');
  }, []);

  /* -------------------------- bio generation ----------------------- */

  const regenerate = useCallback(async () => {
    if (demo) {
      Alert.alert('Model required', 'Activate a real model to generate your profile.');
      return;
    }
    if (!hasModel) {
      Alert.alert('No model active', 'Open Models and activate a model first.');
      return;
    }
    setBusy(true);
    try {
      const bio = await generateBio(
        profile.name,
        profile.occupation,
        profile.location,
      );
      await commit({ bio, generatedAt: Date.now() });
    } catch (e) {
      Alert.alert('Could not generate', (e as Error).message);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [demo, hasModel, profile.name, profile.occupation, profile.location, commit]);

  /* ------------------------------ misc ----------------------------- */

  const clearProfile = useCallback(() => {
    Alert.alert(
      'Erase profile?',
      'Your name, avatar, bio, and preferences will be removed. Stats stay.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase',
          style: 'destructive',
          onPress: async () => {
            await deleteAvatarFile(profile.avatarUri);
            const reset: Profile = {
              ...DEFAULT_PROFILE,
              stats: profile.stats,
            };
            setProfile(reset);
            await saveProfile(reset);
          },
        },
      ],
    );
  }, [profile.avatarUri, profile.stats]);

  const exportProfile = useCallback(async () => {
    try {
      const json = JSON.stringify({ profile, stats: live }, null, 2);
      const target = `${FS.cacheDirectory}profile-export-${Date.now()}.json`;
      await FS.writeAsStringAsync(target, json);
      Alert.alert(
        'Exported',
        `Saved to app cache.\n\nUse a file manager to share it if needed.`,
      );
    } catch (e) {
      Alert.alert('Export failed', (e as Error).message);
    }
  }, [profile, live]);

  /* ---------------------------- rendering -------------------------- */

  const daysActive = profile.stats.firstUsedAt
    ? Math.max(
        1,
        Math.floor((Date.now() - profile.stats.firstUsedAt) / 86_400_000) + 1,
      )
    : 1;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.centerWrap}
        >
          <Pressable
            style={[
              styles.card,
              { backgroundColor: c.surface, borderColor: c.border },
              shadow.lifted,
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text variant="label" color="faint">
                PROFILE
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityLabel="Close profile"
              >
                <Feather name="x" size={18} color={c.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: spacing.md }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Hero */}
              <View style={styles.hero}>
                <Pressable
                  onPress={() =>
                    Alert.alert('Change photo', undefined, [
                      { text: 'Take photo', onPress: () => pickAvatar('camera') },
                      { text: 'Choose from library', onPress: () => pickAvatar('library') },
                      ...(profile.avatarUri
                        ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: removeAvatar }]
                        : []),
                      { text: 'Cancel', style: 'cancel' },
                    ])
                  }
                  disabled={busy}
                  accessibilityLabel="Change profile photo"
                >
                  <Avatar
                    name={profile.name}
                    uri={profile.avatarUri}
                    size={88}
                    editable
                  />
                </Pressable>

                {/* Name */}
                <View style={styles.nameBlock}>
                  {editing === 'name' ? (
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      onBlur={commitEditing}
                      onSubmitEditing={commitEditing}
                      autoFocus
                      placeholder="Your name"
                      placeholderTextColor={c.textFaint}
                      style={[
                        styles.nameInput,
                        { color: c.text, borderBottomColor: c.accent },
                      ]}
                      returnKeyType="done"
                      maxLength={40}
                    />
                  ) : (
                    <Pressable
                      onPress={() => startEditing('name', profile.name)}
                      hitSlop={8}
                      accessibilityLabel={
                        profile.name ? `Edit name: ${profile.name}` : 'Add your name'
                      }
                    >
                      <View style={styles.nameRow}>
                        <Text variant="title" style={{ textAlign: 'center' }}>
                          {profile.name || 'Add your name'}
                        </Text>
                        <Feather
                          name="edit-2"
                          size={14}
                          color={c.textFaint}
                          style={{ marginLeft: 6 }}
                        />
                      </View>
                    </Pressable>
                  )}

                  {/* Occupation / Location inline */}
                  {(profile.occupation || profile.location || !profile.name) && (
                    <View style={styles.metaRow}>
                      {editing === 'occupation' ? (
                        <TextInput
                          value={draft}
                          onChangeText={setDraft}
                          onBlur={commitEditing}
                          onSubmitEditing={commitEditing}
                          autoFocus
                          placeholder="Occupation"
                          placeholderTextColor={c.textFaint}
                          style={[styles.metaInput, { color: c.text, borderBottomColor: c.border }]}
                          returnKeyType="done"
                          maxLength={30}
                        />
                      ) : (
                        <Pressable
                          onPress={() =>
                            startEditing('occupation', profile.occupation)
                          }
                          hitSlop={6}
                        >
                          <Text variant="caption" color="muted">
                            {profile.occupation || '+ occupation'}
                          </Text>
                        </Pressable>
                      )}
                      <Text variant="caption" color="faint">
                        ·
                      </Text>
                      {editing === 'location' ? (
                        <TextInput
                          value={draft}
                          onChangeText={setDraft}
                          onBlur={commitEditing}
                          onSubmitEditing={commitEditing}
                          autoFocus
                          placeholder="Location"
                          placeholderTextColor={c.textFaint}
                          style={[styles.metaInput, { color: c.text, borderBottomColor: c.border }]}
                          returnKeyType="done"
                          maxLength={30}
                        />
                      ) : (
                        <Pressable
                          onPress={() =>
                            startEditing('location', profile.location)
                          }
                          hitSlop={6}
                        >
                          <Text variant="caption" color="muted">
                            {profile.location || '+ location'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              </View>

              {/* Stats strip */}
              <View style={styles.statsRow}>
                <StatCell label="Chats" value={live.conversations} />
                <StatCell label="Messages" value={live.messages} />
                <StatCell label="Days" value={daysActive} />
              </View>

              {/* Segmented tabs */}
              <View
                style={[
                  styles.segment,
                  { backgroundColor: c.surfaceAlt, borderColor: c.border },
                ]}
              >
                {(['bio', 'prefs'] as const).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setSection(s)}
                    style={[
                      styles.segmentBtn,
                      section === s && {
                        backgroundColor: c.surface,
                        ...shadow.soft,
                      },
                    ]}
                  >
                    <Text
                      variant="caption"
                      style={{
                        color: section === s ? c.text : c.textMuted,
                        fontWeight: '600',
                      }}
                    >
                      {s === 'bio' ? 'About you' : 'Preferences'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* About you */}
              {section === 'bio' && (
                <View
                  style={[
                    styles.bioCard,
                    { borderColor: c.border, backgroundColor: c.surfaceAlt },
                  ]}
                >
                  {busy ? (
                    <View style={styles.busyWrap}>
                      <ActivityIndicator color={c.text} />
                      <Text
                        variant="caption"
                        color="muted"
                        style={{ marginTop: spacing.sm }}
                      >
                        Reading your notes and chats…
                      </Text>
                    </View>
                  ) : profile.bio ? (
                    <>
                      <Text
                        variant="body"
                        color="muted"
                        style={{
                          textAlign: 'center',
                          lineHeight: 22,
                          letterSpacing: 0.1,
                          fontStyle: 'italic',
                        }}
                      >
                        {profile.bio}
                      </Text>
                      {profile.generatedAt && (
                        <Text
                          variant="label"
                          color="faint"
                          style={{
                            textAlign: 'center',
                            marginTop: spacing.md,
                            letterSpacing: 0.4,
                          }}
                        >
                          WRITTEN {formatDate(profile.generatedAt).toUpperCase()}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text
                      variant="caption"
                      color="faint"
                      style={{ textAlign: 'center', lineHeight: 20 }}
                    >
                      {demo
                        ? 'Load a model to let the AI describe you.'
                        : 'The AI will write a short description of you, based on your saved facts and recent chats.'}
                    </Text>
                  )}
                </View>
              )}

              {/* Preferences */}
              {section === 'prefs' && (
                <View>
                  <PrefRow
                    title="Response style"
                    value={profile.preferences.responseStyle}
                    options={RESPONSE_STYLES}
                    onChange={(id) =>
                      commit({
                        preferences: { ...profile.preferences, responseStyle: id },
                      })
                    }
                  />
                  <PrefRow
                    title="Tone"
                    value={profile.preferences.tone}
                    options={TONES}
                    onChange={(id) =>
                      commit({
                        preferences: { ...profile.preferences, tone: id },
                      })
                    }
                  />
                  <PrefRow
                    title="Expertise"
                    value={profile.preferences.expertise}
                    options={EXPERTISE}
                    onChange={(id) =>
                      commit({
                        preferences: { ...profile.preferences, expertise: id },
                      })
                    }
                  />
                </View>
              )}

              {/* Footer actions */}
              <View style={styles.footer}>
                {section === 'bio' && (
                  <Button
                    title={profile.bio ? 'Regenerate' : 'Generate description'}
                    size="sm"
                    variant="secondary"
                    icon="refresh-cw"
                    loading={busy}
                    disabled={demo || !hasModel}
                    onPress={regenerate}
                    style={{ flex: 1 }}
                  />
                )}
                {section === 'prefs' && (
                  <Button
                    title="Export profile"
                    size="sm"
                    variant="secondary"
                    icon="download"
                    onPress={exportProfile}
                    style={{ flex: 1 }}
                  />
                )}
                <Pressable
                  onPress={clearProfile}
                  hitSlop={10}
                  accessibilityLabel="Erase profile"
                  style={[styles.eraseBtn, { borderColor: c.border }]}
                >
                  <Feather name="trash-2" size={14} color={c.textMuted} />
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

/* --------------------------- subcomponents --------------------------- */

function StatCell({ label, value }: { label: string; value: number }) {
  const { c } = useTheme();
  return (
    <View style={styles.statCell}>
      <Text variant="heading" style={{ fontSize: 20 }}>
        {value}
      </Text>
      <Text
        variant="label"
        color="faint"
        style={{ marginTop: 2, letterSpacing: 0.6 }}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

interface PrefOption<T> {
  id: T;
  label: string;
  sub: string;
}

function PrefRow<T extends string>({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: T;
  options: PrefOption<T>[];
  onChange: (id: T) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text variant="label" color="faint" style={{ marginBottom: spacing.sm }}>
        {title.toUpperCase()}
      </Text>
      <View
        style={[
          styles.prefGroup,
          { backgroundColor: c.surfaceAlt, borderColor: c.border },
        ]}
      >
        {options.map((opt, i) => {
          const selected = opt.id === value;
          return (
            <Pressable
              key={opt.id}
              onPress={() => onChange(opt.id)}
              style={[
                styles.prefRow,
                i < options.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: c.border,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{opt.label}</Text>
                <Text
                  variant="caption"
                  color="muted"
                  style={{ marginTop: 2 }}
                >
                  {opt.sub}
                </Text>
              </View>
              {selected && (
                <View
                  style={[
                    styles.prefCheck,
                    { backgroundColor: c.primary },
                  ]}
                >
                  <Feather name="check" size={11} color={c.onPrimary} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ------------------------------ styles ------------------------------- */

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,15,8,0.55)',
    justifyContent: 'center',
  },
  centerWrap: { paddingHorizontal: 24, maxHeight: '90%' },
  card: {
    borderRadius: radii['2xl'],
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  hero: { alignItems: 'center' },
  nameBlock: { alignItems: 'center', marginTop: spacing.lg },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  nameInput: {
    fontSize: 22,
    fontWeight: '400',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    textAlign: 'center',
    minWidth: 180,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  metaInput: {
    fontSize: 13,
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    textAlign: 'center',
    minWidth: 80,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing['2xl'],
    paddingVertical: spacing.lg,
  },
  statCell: { alignItems: 'center', flex: 1 },
  segment: {
    flexDirection: 'row',
    borderRadius: radii.pill,
    padding: 3,
    marginTop: spacing.sm,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: radii.pill,
  },
  bioCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 110,
    justifyContent: 'center',
  },
  busyWrap: { alignItems: 'center' },
  prefGroup: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  prefCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing['2xl'],
    alignItems: 'center',
  },
  eraseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});