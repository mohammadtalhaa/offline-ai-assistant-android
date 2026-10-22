/* ------------------------------------------------------------------ *
 *  Formatting utilities — bulletproof against bad input.
 *  Every function is pure, synchronous, and never throws.
 * ------------------------------------------------------------------ */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/* ------------------------------ guards ------------------------------ */

/** True if the value is a finite number (and not NaN / Infinity). */
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Safely coerce anything to a number. Returns 0 on failure. */
function safeNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/* ------------------------------ bytes ------------------------------- */

/**
 * Format a byte count into a human-readable string.
 * Examples:
 *   0            → "0 B"
 *   512          → "512 B"
 *   1024         → "1.0 KB"
 *   1536000      → "1.5 MB"
 *   491_000_000  → "468 MB"
 *   -5           → "0 B"
 *   NaN          → "0 B"
 */
export function formatBytes(input: unknown): string {
  const n = safeNum(input);
  if (n <= 0) return '0 B';

  const i = Math.min(
    BYTE_UNITS.length - 1,
    Math.floor(Math.log(n) / Math.log(1024)),
  );
  const value = n / Math.pow(1024, i);

  // Whole bytes: no decimal. Larger units: 1 decimal unless ≥ 10.
  const decimals = i === 0 ? 0 : value >= 10 ? 0 : 1;
  return `${value.toFixed(decimals)} ${BYTE_UNITS[i]}`;
}

/**
 * Compact byte format for tight UI spaces (no space, 1 letter).
 * Examples:  "1.5M",  "468M",  "2.4G",  "512B"
 */
export function formatBytesShort(input: unknown): string {
  const n = safeNum(input);
  if (n <= 0) return '0B';
  const i = Math.min(
    BYTE_UNITS.length - 1,
    Math.floor(Math.log(n) / Math.log(1024)),
  );
  const value = n / Math.pow(1024, i);
  const decimals = i === 0 ? 0 : value >= 10 ? 0 : 1;
  const suffix = BYTE_UNITS[i][0] === 'B' && i === 0 ? 'B' : BYTE_UNITS[i][0];
  return `${value.toFixed(decimals)}${suffix}`;
}

/* --------------------------- relative time -------------------------- */

/**
 * Human-friendly relative time.
 * Future timestamps collapse to "just now".
 * Beyond 30 days, falls back to a locale date string.
 */
export function timeAgo(ts: unknown): string {
  const t = safeNum(ts);
  if (t <= 0) return '';

  const diff = Date.now() - t;

  // Future timestamps → treat as "just now"
  if (diff < 0) return 'just now';
  if (diff < MINUTE_MS) return 'just now';

  const minutes = Math.floor(diff / MINUTE_MS);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(diff / HOUR_MS);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(diff / DAY_MS);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;

  return safeDate(t);
}

/**
 * Short date label: "Today", "Yesterday", "5d ago", "3w ago", or locale date.
 */
export function formatDate(ts: unknown): string {
  const t = safeNum(ts);
  if (t <= 0) return '';

  const diff = Date.now() - t;
  if (diff < 0) return 'Today';

  const days = Math.floor(diff / DAY_MS);
  if (days < 1) return 'Today';
  if (days < 2) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;

  return safeDate(t);
}

/**
 * Absolute date, locale-aware, wrapped in try/catch because
 * Intl.DateTimeFormat can throw on some Android builds.
 */
export function safeDate(ts: unknown): string {
  const t = safeNum(ts);
  if (t <= 0) return '';
  try {
    return new Date(t).toLocaleDateString();
  } catch {
    // Manual fallback: "2026-10-13"
    const d = new Date(t);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

/**
 * Time-of-day label, locale-aware.
 */
export function safeTime(ts: unknown): string {
  const t = safeNum(ts);
  if (t <= 0) return '';
  try {
    return new Date(t).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    const d = new Date(t);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}

/* ------------------------- token estimation ------------------------- */

/**
 * Rough token estimate for context-window budgeting.
 * Not exact (real tokenizers vary by model), but good enough for trimming.
 * Uses ~3.5 chars per token — closer to reality than a naive /4.
 */
export function estimateTokens(text: unknown): number {
  const s = typeof text === 'string' ? text : '';
  if (!s) return 0;
  return Math.max(1, Math.ceil(s.length / 3.5));
}

/* ---------------------------- numbers ------------------------------- */

/**
 * Format an integer with thousands separators.
 * Example: 1234567 → "1,234,567"
 */
export function formatNumber(input: unknown): string {
  const n = safeNum(input);
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString();
}

/**
 * Format a decimal with fixed precision, using toFixed but guarding NaN.
 */
export function formatDecimal(input: unknown, decimals = 1): string {
  const n = safeNum(input);
  if (!Number.isFinite(n)) return (0).toFixed(decimals);
  return n.toFixed(decimals);
}

/* ------------------------------ percent ----------------------------- */

/**
 * Format a 0..1 ratio as a percentage string.
 * Clamps to [0, 100].
 */
export function formatPercent(ratio: unknown, decimals = 0): string {
  const r = safeNum(ratio);
  const clamped = Math.max(0, Math.min(1, r));
  return `${(clamped * 100).toFixed(decimals)}%`;
}

/* ------------------------------ tokens/s ---------------------------- */

/**
 * Format a tokens-per-second value.
 * Example: 24.3 → "24.3 t/s"
 */
export function formatSpeed(tps: unknown): string {
  const n = safeNum(tps);
  if (n <= 0) return '';
  const decimals = n >= 10 ? 1 : 2;
  return `${n.toFixed(decimals)} t/s`;
}

/* ------------------------------ duration ---------------------------- */

/**
 * Format a duration in milliseconds as a compact string.
 * Example: 75000 → "1m 15s"
 */
export function formatDuration(ms: unknown): string {
  const n = safeNum(ms);
  if (n <= 0) return '0s';

  const totalSec = Math.floor(n / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ------------------------------- ETA -------------------------------- */

/**
 * Estimated time remaining given bytes downloaded and bytes/second.
 * Returns '' when the input is not usable.
 */
export function formatEta(bytesRemaining: unknown, bytesPerSecond: unknown): string {
  const remaining = safeNum(bytesRemaining);
  const rate = safeNum(bytesPerSecond);
  if (remaining <= 0 || rate <= 0) return '';
  const seconds = remaining / rate;
  return formatDuration(seconds * 1000);
}

/* ----------------------------- filename ----------------------------- */

/**
 * Truncate a filename in the middle while preserving the extension.
 * Example: "very-long-document-name-about-something.pdf" with maxLength=24
 *          → "very-long-doc…hing.pdf"
 */
export function truncateFilename(name: unknown, maxLength = 32): string {
  const s = typeof name === 'string' ? name : '';
  if (!s) return '';
  if (s.length <= maxLength) return s;

  const dot = s.lastIndexOf('.');
  const ext = dot > 0 ? s.slice(dot) : '';
  const base = dot > 0 ? s.slice(0, dot) : s;

  const keep = Math.max(4, Math.floor((maxLength - ext.length - 1) / 2));
  const head = base.slice(0, keep);
  const tail = base.slice(-keep);
  return `${head}…${tail}${ext}`;
}

/* ------------------------------ pluralize --------------------------- */

/**
 * Pluralize a count + noun.
 * Example: pluralize(1, 'document') → "1 document"
 *          pluralize(3, 'document') → "3 documents"
 */
export function pluralize(
  count: unknown,
  singular: string,
  plural?: string,
): string {
  const n = Math.round(safeNum(count));
  const word = n === 1 ? singular : (plural ?? `${singular}s`);
  return `${n} ${word}`;
}