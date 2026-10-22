import * as FS from 'expo-file-system/legacy';
import * as Device from 'expo-device';
import { kvDelete, kvGet, kvSet } from '../../services/database/db';
import type { ModelSpec } from './catalog';

const MODELS_DIR = `${FS.documentDirectory}models/`;

export const modelPath = (m: ModelSpec) => `${MODELS_DIR}${m.file}`;
const partPath = (m: ModelSpec) => `${modelPath(m)}.part`;
const resumeKey = (m: ModelSpec) => `dl-resume:${m.id}`;

const active = new Map<string, FS.DownloadResumable>();

async function ensureDir() {
  const info = await FS.getInfoAsync(MODELS_DIR);
  if (!info.exists) await FS.makeDirectoryAsync(MODELS_DIR, { intermediates: true });
}

export async function freeDiskBytes(): Promise<number> {
  try {
    return await FS.getFreeDiskStorageAsync();
  } catch {
    return 0;
  }
}

export function deviceRamGb(): number | null {
  const b = Device.totalMemory;
  return b ? b / 1024 ** 3 : null;
}

export function ramWarning(m: ModelSpec): string | null {
  const ram = deviceRamGb();
  if (ram == null) return null;
  // totalMemory under-reports marketed RAM (a "4 GB" phone often shows ~3.5 GB).
  if (ram + 0.6 < m.minRamGb) return `Needs about ${m.minRamGb} GB RAM; this phone reports ${ram.toFixed(1)} GB.`;
  return null;
}

export type DiskState =
  | { status: 'none' }
  | { status: 'ready'; bytes: number }
  | { status: 'paused'; bytes: number };

export async function inspect(m: ModelSpec): Promise<DiskState> {
  const final = await FS.getInfoAsync(modelPath(m));
  if (final.exists && (final.size ?? 0) > m.sizeBytes * 0.9) return { status: 'ready', bytes: final.size ?? 0 };
  const resume = await kvGet<string>(resumeKey(m));
  const part = await FS.getInfoAsync(partPath(m));
  if (resume && part.exists) return { status: 'paused', bytes: part.size ?? 0 };
  return { status: 'none' };
}

export interface DownloadHandle {
  /** Resolves 'done' when finished, 'interrupted' if paused/cancelled. Throws on failure. */
  promise: Promise<'done' | 'interrupted'>;
}

export function startDownload(
  m: ModelSpec,
  onProgress: (written: number, total: number) => void,
): DownloadHandle {
  const promise = (async (): Promise<'done' | 'interrupted'> => {
    await ensureDir();
    const need = m.sizeBytes * 1.05;
    const part = await FS.getInfoAsync(partPath(m));
    const have = part.exists ? part.size ?? 0 : 0;
    if ((await freeDiskBytes()) + have < need) {
      throw new Error('Not enough free storage for this model.');
    }

    let last = 0;
    const cb = (p: FS.DownloadProgressData) => {
      const now = Date.now();
      if (now - last < 300) return;
      last = now;
      onProgress(p.totalBytesWritten, p.totalBytesExpectedToWrite || m.sizeBytes);
    };

    const savedResume = await kvGet<string>(resumeKey(m));
    let dl: FS.DownloadResumable;
    let result: FS.FileSystemDownloadResult | undefined;
    if (savedResume && part.exists) {
      dl = FS.createDownloadResumable(m.url, partPath(m), {}, cb, savedResume);
      active.set(m.id, dl);
      result = await dl.resumeAsync();
    } else {
      if (part.exists) await FS.deleteAsync(partPath(m), { idempotent: true });
      dl = FS.createDownloadResumable(m.url, partPath(m), {}, cb);
      active.set(m.id, dl);
      result = await dl.downloadAsync();
    }
    active.delete(m.id);

    if (!result) return 'interrupted';
    if (result.status !== 200 && result.status !== 206) {
      throw new Error(`Download failed (HTTP ${result.status}).`);
    }
    const info = await FS.getInfoAsync(partPath(m));
    if (!info.exists || (info.size ?? 0) < m.sizeBytes * 0.9) {
      await FS.deleteAsync(partPath(m), { idempotent: true });
      await kvDelete(resumeKey(m));
      throw new Error('Downloaded file looks incomplete or corrupted. Please retry.');
    }
    await FS.moveAsync({ from: partPath(m), to: modelPath(m) });
    await kvDelete(resumeKey(m));
    return 'done';
  })();
  return { promise };
}

export async function pauseDownload(m: ModelSpec): Promise<void> {
  const dl = active.get(m.id);
  if (!dl) return;
  try {
    const saved = await dl.pauseAsync();
    await kvSet(resumeKey(m), saved.resumeData ?? dl.savable().resumeData ?? '');
  } catch {
    /* ignore */
  }
}

export async function cancelDownload(m: ModelSpec): Promise<void> {
  const dl = active.get(m.id);
  active.delete(m.id);
  try {
    await dl?.cancelAsync();
  } catch {
    /* ignore */
  }
  await FS.deleteAsync(partPath(m), { idempotent: true });
  await kvDelete(resumeKey(m));
}

export async function deleteModelFiles(m: ModelSpec): Promise<void> {
  await cancelDownload(m);
  await FS.deleteAsync(modelPath(m), { idempotent: true });
}
