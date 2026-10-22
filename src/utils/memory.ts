import * as Device from 'expo-device';

/** Total physical RAM in GB (market-reported). */
export function totalRamGb(): number {
  const bytes = Device.totalMemory ?? 0;
  return bytes / 1024 ** 3;
}

/**
 * Conservative estimate of RAM we can actually use for the model.
 * Android reserves ~30–40% for the OS, system UI, and background apps.
 * We assume 55% usable to be safe.
 */
export function usableRamGb(): number {
  const total = totalRamGb();
  if (total <= 0) return 2; // fallback: assume a low-end phone
  return total * 0.55;
}

/**
 * Estimated peak memory a model needs at inference time.
 * Empirically:
 *   - Weights: file size × 1.05 (KV cache + runtime overhead)
 *   - Context: ~0.4 MB per 1K tokens of context (varies by model)
 *   - Runtime + activation buffers: ~500 MB flat
 */
export function estimatePeakRamGb(fileSizeBytes: number, contextSize: number): number {
  const weightsGb = (fileSizeBytes / 1024 ** 3) * 1.05;
  const kvCacheGb = (contextSize / 1024) * 0.4;
  const runtimeGb = 0.5;
  return weightsGb + kvCacheGb + runtimeGb;
}

export type Compatibility =
  | { level: 'safe'; message: string }
  | { level: 'tight'; message: string }
  | { level: 'unsafe'; message: string };

/**
 * Pre-flight check: will this model + context size fit?
 */
export function checkCompatibility(
  fileSizeBytes: number,
  contextSize: number,
): Compatibility {
  const usable = usableRamGb();
  const needed = estimatePeakRamGb(fileSizeBytes, contextSize);
  const ratio = needed / usable;

  if (ratio <= 0.75) {
    return {
      level: 'safe',
      message: 'Should run smoothly on this device.',
    };
  }
  if (ratio <= 0.95) {
    return {
      level: 'tight',
      message: 'May be slow or use a lot of battery on this device.',
    };
  }
  return {
    level: 'unsafe',
    message: `Needs about ${needed.toFixed(1)} GB of free RAM. This phone has ${usable.toFixed(1)} GB usable. Try a smaller model or a shorter context.`,
  };
}

/** Human-readable summary for a model card. */
export function ramSummary(): string {
  const total = totalRamGb();
  const usable = usableRamGb();
  if (total <= 0) return 'Unknown RAM';
  return `${total.toFixed(1)} GB RAM · ${usable.toFixed(1)} GB usable`;
}