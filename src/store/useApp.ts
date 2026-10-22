import NetInfo from '@react-native-community/netinfo';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { create } from 'zustand';
import { ENFORCE_PRO, FREE_MODEL_IDS } from '../config';
import {
  FREE_ENTITLEMENT,
  getBillingProvider,
  isProActive,
  loadEntitlement,
  saveEntitlement,
  clearEntitlement,
  type Entitlement,
  type Plan,
} from '../features/billing/billing';
import { getEngine } from '../features/inference';
import { MODEL_CATALOG, getModel } from '../features/model-manager/catalog';
import {
  cancelDownload,
  deleteModelFiles,
  freeDiskBytes,
  inspect,
  modelPath,
  pauseDownload,
  startDownload,
} from '../features/model-manager/modelManager';
import { getDb, kvGet, kvSet, wipeUserData } from '../services/database/db';
import { DEFAULT_SETTINGS, type Settings } from '../types';
import { checkCompatibility } from '../utils/memory';

/* ------------------------------- types ------------------------------- */

export interface ModelState {
  status: 'none' | 'downloading' | 'paused' | 'ready';
  progress: number; // 0..1
  bytes: number;
  error?: string;
}

interface EngineReadyResult {
  ok: boolean;
  reason?: string;
}

interface AppState {
  ready: boolean;
  settings: Settings;
  models: Record<string, ModelState>;
  modelSpeed: Record<string, number>;
  freeBytes: number;
  entitlement: Entitlement;
  pro: boolean;
  loadingModel: boolean;
  loadingSeconds: number;
  loadedModelId: string | null;
  engineName: string;

  hydrate(): Promise<void>;
  setSettings(p: Partial<Settings>): Promise<void>;
  refreshModels(): Promise<void>;
  downloadModel(id: string): Promise<void>;
  pauseModel(id: string): Promise<void>;
  cancelModel(id: string): Promise<void>;
  removeModel(id: string): Promise<void>;
  setActiveModel(id: string): Promise<boolean>;
  ensureEngineReady(): Promise<EngineReadyResult>;
  preloadModel(): Promise<void>;
  cancelLoad(): Promise<void>;
  unloadModel(): Promise<void>;
  recordSpeed(modelId: string, tps: number): Promise<void>;
  clearCache(): Promise<void>;
  factoryReset(): Promise<void>;
  buy(plan: Plan): Promise<string | null>;
  restore(): Promise<string | null>;
  resetEntitlement(): Promise<void>;
  deleteAllData(): Promise<void>;
}

/* --------------------------- module-level refs ------------------------- */

/** Tracks in-flight downloads so double-taps can't start duplicates. */
const downloadingRef = new Set<string>();

/**
 * Single-flight load promise. When a load is in flight, all callers
 * (user send, preload, etc.) await the same promise — no blocking errors,
 * no duplicate `initLlama` calls.
 */
let loadPromiseRef: Promise<EngineReadyResult> | null = null;

/** Interval handle for tracking loading elapsed time. */
let loadTimerRef: ReturnType<typeof setInterval> | null = null;

/** Hard ceiling on a single model load. After this, we give up. */
const LOAD_TIMEOUT_MS = 90_000;

/* -------------------------------- store -------------------------------- */

export const useApp = create<AppState>((set, get) => {
  /* ------------------------- internal helpers ------------------------- */

  const startLoadTimer = () => {
    stopLoadTimer();
    const started = Date.now();
    set({ loadingSeconds: 0 });
    loadTimerRef = setInterval(() => {
      set({ loadingSeconds: Math.floor((Date.now() - started) / 1000) });
    }, 1000);
  };

  const stopLoadTimer = () => {
    if (loadTimerRef) {
      clearInterval(loadTimerRef);
      loadTimerRef = null;
    }
    set({ loadingSeconds: 0 });
  };

  const setM = (id: string, p: Partial<ModelState>) =>
    set((s) => ({
      models: { ...s.models, [id]: { ...s.models[id], ...p } },
    }));

  return {
    ready: false,
    settings: DEFAULT_SETTINGS,
    models: {},
    modelSpeed: {},
    freeBytes: 0,
    entitlement: FREE_ENTITLEMENT,
    pro: !ENFORCE_PRO,
    loadingModel: false,
    loadingSeconds: 0,
    loadedModelId: null,
    engineName: '',

    /* ---------------------------- hydrate ---------------------------- */

    async hydrate() {
      try {
        await getDb();

        const [savedSettings, savedSpeed, entitlement, freeBytes] =
          await Promise.all([
            kvGet<Partial<Settings>>('settings').catch(() => null),
            kvGet<Record<string, number>>('modelSpeed').catch(() => null),
            loadEntitlement().catch(() => FREE_ENTITLEMENT),
            freeDiskBytes().catch(() => 0),
          ]);

        set({
          settings: { ...DEFAULT_SETTINGS, ...(savedSettings ?? {}) },
          modelSpeed: savedSpeed ?? {},
          entitlement,
          pro: isProActive(entitlement),
          engineName: getEngine().name,
          freeBytes,
        });

        await get().refreshModels();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[useApp] hydrate failed', e);
      } finally {
        set({ ready: true });

        // Background preload of the active model — but only after hydrate
        // has fully settled so we don't race with the initial UI render.
        setTimeout(() => {
          try {
            const st = get();
            if (st.loadingModel) return;
            if (loadPromiseRef) return;
            st.preloadModel().catch(() => {});
          } catch {
            /* silent */
          }
        }, 2000);
      }
    },

    /* ---------------------------- settings --------------------------- */

    async setSettings(p) {
      const before = get().settings;
      const settings = { ...before, ...p };
      set({ settings });
      try {
        await kvSet('settings', settings);
      } catch {
        /* ignore storage write failure */
      }

      // Context size change invalidates the current native context.
      // Guard against same-value or invalid writes.
      if (
        p.contextSize !== undefined &&
        Number.isFinite(p.contextSize) &&
        p.contextSize > 0 &&
        p.contextSize !== before.contextSize
      ) {
        try {
          await getEngine().unload();
        } catch {
          /* ignore */
        }
        set({ loadedModelId: null });
      }
    },

    /* ---------------------------- models ---------------------------- */

    async refreshModels() {
      const prev = get().models;

      const inspected = await Promise.all(
        MODEL_CATALOG.map(async (m) => {
          if (prev[m.id]?.status === 'downloading') {
            return [m.id, prev[m.id]] as const;
          }
          try {
            const d = await inspect(m);
            const state: ModelState = {
              status: d.status,
              bytes: d.status === 'none' ? 0 : d.bytes,
              progress:
                d.status === 'ready'
                  ? 1
                  : d.status === 'paused'
                  ? d.bytes / m.sizeBytes
                  : 0,
            };
            return [m.id, state] as const;
          } catch (e) {
            return [
              m.id,
              {
                status: 'none' as const,
                progress: 0,
                bytes: 0,
                error: (e as Error).message,
              },
            ] as const;
          }
        }),
      );

      const models: Record<string, ModelState> = {};
      for (const [id, state] of inspected) models[id] = state;

      let free = get().freeBytes;
      try {
        free = await freeDiskBytes();
      } catch {
        /* keep last known value */
      }

      set({ models, freeBytes: free });
    },

    /* --------------------------- downloads -------------------------- */

    async downloadModel(id) {
      const m = getModel(id);
      if (!m) return;

      if (downloadingRef.has(id)) return;
      if (get().models[id]?.status === 'downloading') return;

      if (ENFORCE_PRO && m.proOnly && !get().pro) return;

      // Wi-Fi gate
      if (get().settings.wifiOnly) {
        try {
          const net = await NetInfo.fetch();
          if (net.type === 'cellular') {
            setM(id, {
              status: 'none',
              progress: 0,
              bytes: 0,
              error:
                'Wi-Fi only is on. Connect to Wi-Fi or change it in Settings.',
            });
            return;
          }
        } catch {
          /* network check failed — allow the download to try */
        }
      }

      // Free-space pre-flight
      const need = m.sizeBytes * 1.05;
      const have = get().freeBytes;
      if (have > 0 && have < need) {
        setM(id, {
          status: 'none',
          progress: 0,
          bytes: 0,
          error: `Not enough free storage. Need ${(
            m.sizeBytes / 1024 ** 3
          ).toFixed(1)} GB.`,
        });
        return;
      }

      downloadingRef.add(id);
      setM(id, { status: 'downloading', error: undefined, bytes: 0, progress: 0 });

      await activateKeepAwakeAsync('model-download').catch(() => {});

      try {
        const { promise } = startDownload(m, (w, t) =>
          setM(id, {
            status: 'downloading',
            bytes: w,
            progress: t > 0 ? Math.min(1, w / t) : 0,
          }),
        );

        const result = await promise;

        if (result === 'done') {
          setM(id, {
            status: 'ready',
            progress: 1,
            bytes: m.sizeBytes,
            error: undefined,
          });

          if (!get().settings.activeModelId) {
            await get().setSettings({ activeModelId: id });
          }

          // Preload right after download — the user is likely to open chat next
          setTimeout(() => {
            try {
              const st = get();
              if (st.loadingModel) return;
              if (loadPromiseRef) return;
              st.preloadModel().catch(() => {});
            } catch {
              /* silent */
            }
          }, 1200);
        } else {
          await get().refreshModels();
        }
      } catch (e) {
        const msg = (e as Error).message;
        setM(id, { status: 'none', progress: 0, bytes: 0, error: msg });
        try {
          await get().refreshModels();
        } catch {
          /* ignore */
        }
        setM(id, { error: msg });
      } finally {
        downloadingRef.delete(id);
        try {
          deactivateKeepAwake('model-download');
        } catch {
          /* ignore */
        }
        try {
          const free = await freeDiskBytes();
          set({ freeBytes: free });
        } catch {
          /* ignore */
        }
      }
    },

    async pauseModel(id) {
      const m = getModel(id);
      if (!m) return;
      if (get().models[id]?.status !== 'downloading') return;
      try {
        await pauseDownload(m);
      } catch {
        /* ignore */
      }
      setM(id, { status: 'paused' });
    },

    async cancelModel(id) {
      const m = getModel(id);
      if (!m) return;
      try {
        await cancelDownload(m);
      } catch {
        /* ignore */
      }
      downloadingRef.delete(id);
      setM(id, { status: 'none', progress: 0, bytes: 0, error: undefined });
      try {
        const free = await freeDiskBytes();
        set({ freeBytes: free });
      } catch {
        /* ignore */
      }
    },

    async removeModel(id) {
      const m = getModel(id);
      if (!m) return;

      if (get().loadedModelId === id) {
        try {
          await get().unloadModel();
        } catch {
          /* ignore */
        }
      }
      if (get().settings.activeModelId === id) {
        await get().setSettings({ activeModelId: null });
      }

      try {
        await deleteModelFiles(m);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[useApp] deleteModelFiles failed', e);
      }

      const speed = { ...get().modelSpeed };
      delete speed[id];
      set({ modelSpeed: speed });
      try {
        await kvSet('modelSpeed', speed);
      } catch {
        /* ignore */
      }

      await get().refreshModels();
    },

    /* ------------------------- active model ------------------------- */

    async setActiveModel(id) {
      const m = getModel(id);
      if (!m) return false;

      const compat = checkCompatibility(m.sizeBytes, get().settings.contextSize);
      if (compat.level === 'unsafe') return false;

      const previous = get().settings.activeModelId;

      await get().setSettings({ activeModelId: id });
      set({ loadedModelId: null });

      const result = await get().ensureEngineReady();
      if (!result.ok) {
        await get().setSettings({ activeModelId: previous });
        set({ loadedModelId: null });
        if (previous) {
          try {
            await get().ensureEngineReady();
          } catch {
            /* ignore */
          }
        }
        return false;
      }
      return true;
    },

    /* --------------------- ensure / preload / cancel ---------------- */

    async ensureEngineReady() {
      const engine = getEngine();
      const { settings, loadedModelId } = get();

      // Demo engine
      if (!engine.requiresModel) {
        if (!engine.isLoaded()) {
          try {
            await engine.load('demo', { contextSize: settings.contextSize });
          } catch (e) {
            return {
              ok: false,
              reason: `Demo engine failed: ${(e as Error).message}`,
            };
          }
        }
        return { ok: true };
      }

      const m = getModel(settings.activeModelId);
      if (!m || get().models[m.id]?.status !== 'ready') {
        return {
          ok: false,
          reason: 'No model is installed yet. Download one in the Models tab.',
        };
      }

      // Already loaded the same model → ready
      if (engine.isLoaded() && loadedModelId === m.id) return { ok: true };

      // If a load is already in flight, wait on the same promise
      if (loadPromiseRef) return loadPromiseRef;

      // Pre-flight RAM check
      const compat = checkCompatibility(m.sizeBytes, settings.contextSize);
      if (compat.level === 'unsafe') {
        return { ok: false, reason: compat.message };
      }

      set({ loadingModel: true });
      startLoadTimer();

      const p = (async (): Promise<EngineReadyResult> => {
        try {
          // Race the native load against a hard timeout.
          // If initLlama hangs, we surface an error instead of freezing.
          const loadPromise = engine.load(modelPath(m), {
            contextSize: settings.contextSize,
          });

          const timeoutPromise = new Promise<void>((_, reject) => {
            setTimeout(() => {
              reject(
                new Error(
                  'Loading took too long. The model may be too large for this device.',
                ),
              );
            }, LOAD_TIMEOUT_MS);
          });

          await Promise.race([loadPromise, timeoutPromise]);

          set({ loadedModelId: m.id });
          return { ok: true };
        } catch (e) {
          set({ loadedModelId: null });
          const msg = (e as Error).message;
          return {
            ok: false,
            reason:
              msg && msg.length < 300
                ? msg
                : 'This model could not be loaded on this device. Try a smaller model or reduce context size in Settings.',
          };
        } finally {
          loadPromiseRef = null;
          stopLoadTimer();
          set({ loadingModel: false });
        }
      })();

      loadPromiseRef = p;
      return p;
    },

    async preloadModel() {
      const { settings, models, loadedModelId } = get();
      const m = getModel(settings.activeModelId);
      if (!m) return;
      if (models[m.id]?.status !== 'ready') return;

      const engine = getEngine();
      if (engine.isLoaded() && loadedModelId === m.id) return;

      // Don't start a new load if one is already in flight
      if (loadPromiseRef) return;
      if (get().loadingModel) return;

      try {
        await get().ensureEngineReady();
      } catch {
        /* silent */
      }
    },

    async cancelLoad() {
      // Break the single-flight promise so new callers start fresh
      loadPromiseRef = null;
      stopLoadTimer();
      try {
        await getEngine().unload();
      } catch {
        /* ignore */
      }
      set({ loadingModel: false, loadedModelId: null });
    },

    async unloadModel() {
      try {
        await getEngine().unload();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[useApp] unload failed', e);
      }
      set({ loadedModelId: null });
    },

    /* --------------------------- speed data ------------------------- */

    async recordSpeed(modelId, tps) {
      if (!Number.isFinite(tps) || tps <= 0) return;
      const speed = { ...get().modelSpeed, [modelId]: tps };
      set({ modelSpeed: speed });
      try {
        await kvSet('modelSpeed', speed);
      } catch {
        /* ignore */
      }
    },

    async clearCache() {
      await get().unloadModel();
      set({ modelSpeed: {} });
      try {
        await kvSet('modelSpeed', {});
      } catch {
        /* ignore */
      }
    },

    async factoryReset() {
      for (const m of MODEL_CATALOG) {
        try {
          await deleteModelFiles(m);
        } catch {
          /* ignore per-model failure */
        }
      }
      try {
        await get().unloadModel();
      } catch {
        /* ignore */
      }
      try {
        await kvSet('settings', DEFAULT_SETTINGS);
        await kvSet('modelSpeed', {});
      } catch {
        /* ignore */
      }
      set({
        settings: DEFAULT_SETTINGS,
        models: {},
        modelSpeed: {},
        loadedModelId: null,
      });
      await get().refreshModels();
    },

    /* ---------------------------- billing --------------------------- */

    async buy(plan) {
      const provider = getBillingProvider();
      if (!provider) {
        return 'Billing is not configured in this build. See README → Subscriptions.';
      }
      try {
        const e = await provider.purchase(plan);
        await saveEntitlement(e);
        set({ entitlement: e, pro: isProActive(e) });
        return null;
      } catch (err) {
        return (err as Error).message;
      }
    },

    async restore() {
      const provider = getBillingProvider();
      if (!provider) return 'Billing is not configured in this build.';
      try {
        const e = await provider.restore();
        if (!e) return 'No previous purchase found.';
        await saveEntitlement(e);
        set({ entitlement: e, pro: isProActive(e) });
        return null;
      } catch (err) {
        return (err as Error).message;
      }
    },

    async resetEntitlement() {
      try {
        await clearEntitlement();
      } catch {
        /* ignore */
      }
      set({ entitlement: FREE_ENTITLEMENT, pro: isProActive(FREE_ENTITLEMENT) });
    },

    /* ---------------------------- data wipe ------------------------- */

    async deleteAllData() {
      try {
        await wipeUserData();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[useApp] wipeUserData failed', e);
      }
    },
  };
});

/* ------------------------------ helpers ------------------------------ */

export const isFreeModel = (id: string) => FREE_MODEL_IDS.includes(id);