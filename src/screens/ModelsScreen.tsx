import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen, Text, Button, FadeInView } from '../components/ui/kit';
import {
  MODEL_CATALOG,
  TIER_ORDER,
  type ModelSpec,
  type ModelTier,
} from '../features/model-manager/catalog';
import { deviceRamGb } from '../features/model-manager/modelManager';
import { useApp } from '../store/useApp';
import { useTheme, spacing, radii, shadow } from '../theme/theme';
import { formatBytes, formatSpeed } from '../utils/format';
import { checkCompatibility, ramSummary } from '../utils/memory';
import type { RootStackParams } from '../navigation/types';

/* ------------------------------ constants ------------------------------ */

const TIER_COLOR: Record<ModelTier, string> = {
  Lite: '#5B9BD5',
  Better: '#6BAA75',
  Pro: '#C9754A',
  Extreme: '#A855C7',
};

const TIER_ICON: Record<ModelTier, keyof typeof Feather.glyphMap> = {
  Lite: 'feather',
  Better: 'zap',
  Pro: 'award',
  Extreme: 'star',
};

const DEFAULT_MODEL_STATE = { status: 'none' as const, progress: 0, bytes: 0 };

// Hoisted — no array re-allocation on every render
const FILTERS: (ModelTier | 'All')[] = ['All', ...TIER_ORDER];

/* ------------------------------- screen -------------------------------- */

export default function ModelsScreen() {
  const { c } = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();

  const [activeTier, setActiveTier] = useState<ModelTier | 'All'>('All');
  const [refreshing, setRefreshing] = useState(false);

  // Granular subscriptions
  const freeBytes = useApp((s) => s.freeBytes);
  const engineName = useApp((s) => s.engineName);
  const activeModelId = useApp((s) => s.settings.activeModelId);
  const loadedModelId = useApp((s) => s.loadedModelId);
  const loadingModel = useApp((s) => s.loadingModel);
  const refreshModels = useApp((s) => s.refreshModels);

  const ram = useMemo(() => deviceRamGb(), []);

  // Initial refresh — safe to run once
  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshModels();
    } finally {
      setRefreshing(false);
    }
  }, [refreshModels]);

  const models = useMemo(
    () =>
      activeTier === 'All'
        ? MODEL_CATALOG
        : MODEL_CATALOG.filter((m) => m.tier === activeTier),
    [activeTier],
  );

  const activeModel = useMemo(
    () => MODEL_CATALOG.find((m) => m.id === activeModelId),
    [activeModelId],
  );

  const loaded = loadedModelId === activeModelId && !!activeModel;

  const deviceLabel = useMemo(() => {
    const parts: string[] = [formatBytes(freeBytes) + ' free'];
    if (ram) parts.push(`${ram.toFixed(1)} GB RAM`);
    return parts.join(' · ');
  }, [freeBytes, ram]);

  return (
    <Screen edges={{ top: true, bottom: true }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.textMuted}
            colors={[c.primary]}
          />
        }
        contentContainerStyle={{ paddingBottom: 180 }}
      >
        {/* Header */}
        <FadeInView delay={0}>
          <View
            style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg }}
          >
            <Text variant="display">Models</Text>
            <Text
              variant="body"
              color="muted"
              style={{ marginTop: spacing.sm }}
            >
              Pick what runs on your device.
            </Text>

            <View
              style={[
                styles.deviceBar,
                { backgroundColor: c.surface, borderColor: c.border },
                shadow.soft,
              ]}
            >
              <Feather name="smartphone" size={16} color={c.textMuted} />
              <Text variant="caption" color="muted" style={{ flex: 1 }}>
                {deviceLabel}
              </Text>
              <Text
                variant="caption"
                color="faint"
                numberOfLines={1}
                style={{ maxWidth: 100 }}
              >
                {engineName.split(' ')[0] || 'Engine'}
              </Text>
            </View>
          </View>
        </FadeInView>

        {/* Active model banner */}
        {activeModel && (
          <FadeInView delay={40}>
            <View
              style={[
                styles.activeBanner,
                {
                  backgroundColor: c.surfaceAlt,
                  borderColor: loaded ? c.primary : c.border,
                  borderWidth: loaded ? 1 : StyleSheet.hairlineWidth,
                  marginHorizontal: spacing.xl,
                },
              ]}
              accessible
              accessibilityLabel={`Active model: ${activeModel.name}. ${
                loaded ? 'Loaded and ready' : 'Not yet loaded'
              }`}
            >
              <View style={styles.activeBannerIcon}>
                {loadingModel ? (
                  <ActivityIndicator size="small" color={c.text} />
                ) : (
                  <Feather
                    name={loaded ? 'check-circle' : 'circle'}
                    size={15}
                    color={loaded ? c.text : c.textMuted}
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="caption" color="muted">
                  {loadingModel
                    ? 'LOADING INTO MEMORY…'
                    : loaded
                    ? 'ACTIVE MODEL · READY'
                    : 'ACTIVE MODEL · ON DEMAND'}
                </Text>
                <Text
                  variant="bodyStrong"
                  numberOfLines={1}
                  style={{ marginTop: 2 }}
                >
                  {activeModel.name}
                </Text>
              </View>
            </View>
          </FadeInView>
        )}

        {/* Filter chips */}
        <FadeInView delay={80}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {FILTERS.map((t) => {
              const active = activeTier === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setActiveTier(t)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Show ${t} models`}
                  hitSlop={6}
                  style={[
                    styles.tierChip,
                    {
                      backgroundColor: active ? c.primary : c.surface,
                      borderColor: active ? c.primary : c.border,
                    },
                  ]}
                >
                  <Text
                    variant="caption"
                    style={{
                      color: active ? c.onPrimary : c.text,
                      fontWeight: '500',
                    }}
                  >
                    {t}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </FadeInView>

        {/* Model cards */}
        <View
          style={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            gap: spacing.md,
          }}
        >
          {models.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="package" size={24} color={c.textFaint} />
              <Text
                variant="body"
                color="muted"
                style={{ marginTop: spacing.md }}
              >
                No models in this tier yet.
              </Text>
            </View>
          ) : (
            models.map((m, i) => (
              <FadeInView
                key={m.id}
                delay={Math.min(120 + i * 35, 280)}
              >
                <ModelCard
                  model={m}
                  nav={nav}
                  isActive={activeModelId === m.id}
                  isLoaded={loadedModelId === m.id}
                />
              </FadeInView>
            ))
          )}
        </View>

        <Text
          variant="caption"
          color="faint"
          style={{
            textAlign: 'center',
            marginTop: spacing['3xl'],
            paddingHorizontal: spacing.xl,
          }}
        >
          Models download once and run entirely offline. You can delete any
          model at any time.
        </Text>
      </ScrollView>
    </Screen>
  );
}

/* ----------------------------- model card ----------------------------- */

interface ModelCardProps {
  model: ModelSpec;
  nav: NativeStackNavigationProp<RootStackParams>;
  isActive: boolean;
  isLoaded: boolean;
}

function ModelCard({ model, nav, isActive, isLoaded }: ModelCardProps) {
  const { c } = useTheme();

  // Per-card subscriptions
  const st = useApp((s) => s.models[model.id] ?? DEFAULT_MODEL_STATE);
  const pro = useApp((s) => s.pro);
  const speed = useApp((s) => s.modelSpeed[model.id]);
  const loadingModel = useApp((s) => s.loadingModel);

  const downloadModel = useApp((s) => s.downloadModel);
  const pauseModel = useApp((s) => s.pauseModel);
  const cancelModel = useApp((s) => s.cancelModel);
  const removeModel = useApp((s) => s.removeModel);
  const setActiveModel = useApp((s) => s.setActiveModel);

  // Local acting lock — prevents double-tap on the same card
  const actingRef = useRef(false);
  const [acting, setActing] = useState(false);

  // Animated progress bar
  const progress = useSharedValue(st.progress);
  const lastProgress = useRef(st.progress);
  useEffect(() => {
    // If progress jumps by more than 5%, snap without animating (resumed download)
    const delta = Math.abs(st.progress - lastProgress.current);
    if (delta > 0.05) {
      progress.value = st.progress;
    } else {
      progress.value = withTiming(st.progress, {
        duration: 200,
        easing: Easing.out(Easing.quad),
      });
    }
    lastProgress.current = st.progress;
  }, [st.progress, progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, progress.value)) * 100}%`,
  }));

  // Pulsing animation for loading state
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (isActive && loadingModel) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
        false,
      );
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [isActive, loadingModel, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const locked = model.proOnly && !pro;
  const compat = useMemo(
    () => checkCompatibility(model.sizeBytes, 4096),
    [model.sizeBytes],
  );
  const unsafe = compat.level === 'unsafe';
  const tierColor = TIER_COLOR[model.tier];

  /* --------------------------- action wrappers --------------------------- */

  const runOnce = useCallback(
    async (fn: () => Promise<void> | void) => {
      if (actingRef.current) return;
      actingRef.current = true;
      setActing(true);
      try {
        await fn();
      } finally {
        setTimeout(() => {
          actingRef.current = false;
          setActing(false);
        }, 350);
      }
    },
    [],
  );

  const onDownload = useCallback(
    () =>
      runOnce(async () => {
        try {
          await downloadModel(model.id);
        } catch (e) {
          Alert.alert('Download failed', (e as Error).message);
        }
      }),
    [runOnce, downloadModel, model.id],
  );

  const onPause = useCallback(
    () => runOnce(() => pauseModel(model.id)),
    [runOnce, pauseModel, model.id],
  );

  const onCancel = useCallback(
    () =>
      runOnce(
        () =>
          new Promise<void>((resolve) => {
            Alert.alert(
              'Cancel download?',
              'The partial file will be removed.',
              [
                { text: 'Keep', style: 'cancel', onPress: () => resolve() },
                {
                  text: 'Cancel download',
                  style: 'destructive',
                  onPress: async () => {
                    await cancelModel(model.id);
                    resolve();
                  },
                },
              ],
            );
          }),
      ),
    [runOnce, cancelModel, model.id],
  );

  const onUse = useCallback(
    () =>
      runOnce(async () => {
        const ok = await setActiveModel(model.id);
        if (!ok) {
          Alert.alert(
            'Could not activate',
            unsafe
              ? compat.message
              : 'This device may not have enough memory. Try a smaller model or re-download this one.',
          );
        }
      }),
    [runOnce, setActiveModel, model.id, unsafe, compat.message],
  );

  const onDelete = useCallback(
    () =>
      runOnce(
        () =>
          new Promise<void>((resolve) => {
            Alert.alert(
              'Delete model?',
              `Frees ${formatBytes(model.sizeBytes)}. You can re-download it later.`,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await removeModel(model.id);
                    resolve();
                  },
                },
              ],
            );
          }),
      ),
    [runOnce, removeModel, model.id, model.sizeBytes],
  );

  const onUpgrade = useCallback(() => nav.navigate('Upgrade'), [nav]);

  /* ---------------------------- derived states --------------------------- */

  const isDownloading = st.status === 'downloading';
  const isPaused = st.status === 'paused';
  const isReady = st.status === 'ready';
  const isNone = st.status === 'none';

  // Single badge slot — highest priority wins
  const badge = useMemo(() => {
    if (isActive) {
      return {
        icon: loadingModel ? 'loader' : 'check',
        label: loadingModel ? 'LOADING' : 'ACTIVE',
        bg: c.primary,
        fg: c.onPrimary,
      };
    }
    if (locked) {
      return {
        icon: 'lock',
        label: 'PRO',
        bg: c.surfaceAlt,
        fg: c.textMuted,
      };
    }
    if (isReady) {
      return {
        icon: 'download-cloud',
        label: 'DOWNLOADED',
        bg: c.surfaceAlt,
        fg: c.textMuted,
      };
    }
    return null;
  }, [isActive, isReady, locked, loadingModel, c]);

  /* ------------------------------- render ------------------------------- */

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: isActive ? c.primary : c.border,
          borderWidth: isActive ? 1.5 : StyleSheet.hairlineWidth,
        },
        shadow.soft,
      ]}
      accessible
      accessibilityLabel={`${model.name}. ${model.tier} tier. ${
        isActive
          ? isLoaded
            ? 'Active and loaded'
            : 'Active'
          : isReady
          ? 'Ready to use'
          : isDownloading
          ? 'Downloading'
          : 'Not downloaded'
      }`}
    >
      {/* Top row: tier badge + status badge */}
      <View style={styles.cardTop}>
        <View
          style={[styles.tierBadge, { backgroundColor: tierColor + '1A' }]}
        >
          <Feather name={TIER_ICON[model.tier]} size={12} color={tierColor} />
          <Text variant="label" style={{ color: tierColor, marginLeft: 4 }}>
            {model.tier.toUpperCase()}
          </Text>
        </View>

        {badge && (
          <Animated.View
            style={[
              styles.statusBadge,
              { backgroundColor: badge.bg },
              isActive && loadingModel ? pulseStyle : null,
            ]}
          >
            <Feather name={badge.icon as any} size={11} color={badge.fg} />
            <Text
              variant="label"
              style={{ color: badge.fg, marginLeft: 3 }}
            >
              {badge.label}
            </Text>
          </Animated.View>
        )}
      </View>

      {/* Name */}
      <Text variant="heading" style={{ marginTop: spacing.md }}>
        {model.name}
      </Text>
      <Text variant="caption" color="muted" style={{ marginTop: 2 }}>
        {model.blurb}
      </Text>
      <Text
        variant="body"
        color="muted"
        style={{ marginTop: spacing.md, lineHeight: 21 }}
      >
        {model.desc}
      </Text>

      {/* Stats grid */}
      <View style={[styles.stats, { borderTopColor: c.border }]}>
        <Stat
          icon="hard-drive"
          label="Size"
          value={formatBytes(model.sizeBytes)}
        />
        <Stat icon="cpu" label="Min RAM" value={`${model.minRamGb} GB`} />
        <Stat
          icon="zap"
          label="Speed"
          value={speed ? formatSpeed(speed) : model.speed}
        />
        <Stat icon="sliders" label="Quant" value={model.quant} />
      </View>

      {/* Compatibility warning */}
      {compat.level !== 'safe' && (
        <View
          style={[
            styles.warn,
            {
              backgroundColor:
                compat.level === 'unsafe' ? c.danger + '12' : c.accent + '14',
              borderColor:
                compat.level === 'unsafe' ? c.danger + '30' : c.accent + '30',
            },
          ]}
        >
          <Feather
            name={compat.level === 'unsafe' ? 'x-octagon' : 'alert-triangle'}
            size={13}
            color={compat.level === 'unsafe' ? c.danger : c.accent}
          />
          <Text
            variant="caption"
            color={compat.level === 'unsafe' ? 'danger' : 'accent'}
            style={{ marginLeft: 6, flex: 1 }}
          >
            {compat.message}
          </Text>
        </View>
      )}

      {/* Runtime error */}
      {st.error && !isDownloading && (
        <View
          style={[
            styles.warn,
            {
              backgroundColor: c.danger + '12',
              borderColor: c.danger + '30',
            },
          ]}
        >
          <Feather name="alert-circle" size={13} color={c.danger} />
          <Text
            variant="caption"
            color="danger"
            style={{ marginLeft: 6, flex: 1 }}
          >
            {st.error}
          </Text>
        </View>
      )}

      {/* Download progress */}
      {(isDownloading || isPaused) && (
        <View style={{ marginTop: spacing.md }}>
          <View
            style={[styles.progressTrack, { backgroundColor: c.surfaceAlt }]}
          >
            <Animated.View
              style={[
                styles.progressFill,
                { backgroundColor: tierColor },
                barStyle,
              ]}
            />
          </View>
          <View style={styles.progressMeta}>
            <Text variant="caption" color="muted">
              {formatBytes(st.bytes)} / {formatBytes(model.sizeBytes)}
            </Text>
            <Text variant="caption" color="muted">
              {isPaused ? 'Paused · ' : ''}
              {Math.round(st.progress * 100)}%
            </Text>
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {isNone &&
          (locked ? (
            <Button
              size="sm"
              icon="unlock"
              title="Unlock with Pro"
              onPress={onUpgrade}
            />
          ) : unsafe ? (
            <Button
              size="sm"
              icon="x-octagon"
              title="Too big for this device"
              disabled
              onPress={() => {}}
            />
          ) : (
            <Button
              size="sm"
              icon="download"
              title={acting ? 'Starting…' : 'Download'}
              loading={acting}
              onPress={onDownload}
            />
          ))}

        {isDownloading && (
          <>
            <Button
              size="sm"
              variant="ghost"
              icon="pause"
              title="Pause"
              onPress={onPause}
            />
            <Button
              size="sm"
              variant="ghost"
              icon="x"
              title="Cancel"
              onPress={onCancel}
            />
          </>
        )}

        {isPaused && (
          <>
            <Button
              size="sm"
              icon="play"
              title="Resume"
              loading={acting}
              onPress={onDownload}
            />
            <Button
              size="sm"
              variant="ghost"
              icon="x"
              title="Cancel"
              onPress={onCancel}
            />
          </>
        )}

        {isReady && (
          <>
            <Button
              size="sm"
              title={
                isActive
                  ? isLoaded
                    ? 'Active ✓'
                    : 'Loading…'
                  : unsafe
                  ? 'Not enough RAM'
                  : 'Use this model'
              }
              disabled={isActive || unsafe || loadingModel}
              loading={acting && !isActive && !loadingModel}
              onPress={onUse}
            />
            <Button
              size="sm"
              variant="ghost"
              icon="trash-2"
              title=""
              onPress={onDelete}
              style={styles.iconButton}
            />
          </>
        )}
      </View>

      {/* License */}
      <Text
        variant="label"
        color="faint"
        style={{ marginTop: spacing.md }}
      >
        {model.license.toUpperCase()}
      </Text>
    </View>
  );
}

/* -------------------------------- stat -------------------------------- */

function Stat({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.stat}>
      <Feather name={icon} size={13} color={c.textFaint} />
      <Text variant="label" color="faint" style={{ marginTop: 4 }}>
        {label.toUpperCase()}
      </Text>
      <Text variant="caption" style={{ marginTop: 2, fontWeight: '500' }}>
        {value}
      </Text>
    </View>
  );
}

/* ------------------------------- styles -------------------------------- */

const styles = StyleSheet.create({
  deviceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  activeBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  tierChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  card: {
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stat: { flex: 1 },
  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    paddingHorizontal: 0,
    borderRadius: 22,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
});