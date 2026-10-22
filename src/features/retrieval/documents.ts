import * as DocumentPicker from 'expo-document-picker';
import * as FS from 'expo-file-system/legacy';
import { inflateSync, strFromU8, unzipSync } from 'fflate';
import { addDocument, getAllChunks } from '../../services/database/db';
import type { ChunkRow } from '../../types';
import { rank } from './bm25';
import { chunkText } from './chunker';

/* ================================================================== *
 *  CONFIG
 * ================================================================== */

const MAX_BYTES = 25 * 1024 * 1024;   // 25 MB hard cap
const MAX_CHARS = 2_000_000;          // ~2 M chars of extracted text
const MAX_PDF_BIN_BYTES = 20 * 1024 * 1024; // 20 MB cap on binary-string conversion
const EXTRACT_TIMEOUT_MS = 45_000;    // per-file wall clock guard

const TEXT_EXTS = new Set([
  'txt', 'md', 'markdown', 'csv', 'json', 'log', 'html', 'htm', 'xml', 'yaml', 'yml',
]);

/* ================================================================== *
 *  PUBLIC TYPES
 * ================================================================== */

export type ImportProgress = {
  stage: 'reading' | 'extracting' | 'chunking' | 'storing';
  /** 0..1 — approximate when available. */
  progress: number;
};

export interface ImportOptions {
  /** Abort long-running extractions from the caller. */
  signal?: AbortSignal;
  /** Called multiple times as the import proceeds. */
  onProgress?: (p: ImportProgress) => void;
}

export type ImportResult =
  | { ok: true; name: string; chunks: number; chars: number; ms: number }
  | { ok: false; reason: string; cancelled?: boolean };

export type ExtractResult =
  | { ok: true; text: string; chars: number }
  | { ok: false; reason: string };

type InternalExtract =
  | { ok: true; text: string }
  | { ok: false; error: string };

/* ================================================================== *
 *  LOW-LEVEL HELPERS
 * ================================================================== */

function getExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function sanitizeFilename(name: string): string {
  const base = (name || 'Untitled').replace(/[\r\n\t]+/g, ' ').trim();
  return base.slice(0, 300) || 'Untitled';
}

function isAborted(signal?: AbortSignal): boolean {
  return !!signal?.aborted;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error('aborted');
    (err as any).name = 'AbortError';
    throw err;
  }
}

/** Race a promise against an AbortSignal + timeout. */
function withGuards<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  timeoutMs = EXTRACT_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Extraction timed out. The file may be corrupted or too complex.'));
    }, timeoutMs);

    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const err = new Error('aborted');
      (err as any).name = 'AbortError';
      reject(err);
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

/* ================================================================== *
 *  BASE64 → BYTES (fast, allocation-friendly)
 * ================================================================== */

// Precomputed lookup table — 25× faster than `indexOf` on the alphabet string.
const B64_LOOKUP = (() => {
  const table = new Int16Array(256).fill(-1);
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < alphabet.length; i++) {
    table[alphabet.charCodeAt(i)] = i;
  }
  return table;
})();

function base64ToBytes(b64: string): Uint8Array {
  // Strip anything that isn't base64 (whitespace, newlines).
  const cleanLen = (() => {
    let n = 0;
    for (let i = 0; i < b64.length; i++) {
      if (B64_LOOKUP[b64.charCodeAt(i)] >= 0) n++;
    }
    return n;
  })();

  const outLen = Math.floor((cleanLen * 3) / 4);
  const out = new Uint8Array(outLen);

  let p = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < b64.length; i++) {
    const v = B64_LOOKUP[b64.charCodeAt(i)];
    if (v < 0) continue; // skip non-base64 chars
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (p < outLen) out[p++] = (buffer >> bits) & 0xff;
    }
  }
  return p === outLen ? out : out.subarray(0, p);
}

/** Fast binary string conversion. Avoids String.fromCharCode.apply with huge arrays. */
function bytesToBinaryString(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, bytes.length);
    let piece = '';
    for (let j = i; j < end; j++) {
      piece += String.fromCharCode(bytes[j]);
    }
    s += piece;
  }
  return s;
}

/* ================================================================== *
 *  FILE READS
 * ================================================================== */

async function readBase64(uri: string): Promise<string> {
  const v = await FS.readAsStringAsync(uri, { encoding: FS.EncodingType.Base64 });
  return v as unknown as string;
}

async function readUTF8(uri: string): Promise<string> {
  const v = await FS.readAsStringAsync(uri);
  return v as unknown as string;
}

/**
 * Strip a UTF-8 or UTF-16 BOM and normalise line endings.
 * Cheap; prevents garbled first characters when the source had a BOM.
 */
function normalizeText(raw: string): string {
  let s = raw;
  // UTF-8 BOM
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  // UTF-16 LE BOM (\xFF\xFE) — as a JS string this shows up as "ÿþ"
  if (s.charCodeAt(0) === 0xff && s.charCodeAt(1) === 0xfe) s = s.slice(2);
  // UTF-16 BE BOM (\xFE\xFF)
  if (s.charCodeAt(0) === 0xfe && s.charCodeAt(1) === 0xff) s = s.slice(2);
  return s.replace(/\r\n?/g, '\n');
}

/* ================================================================== *
 *  XML / ENTITY HELPERS
 * ================================================================== */

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripXmlTags(xml: string): string {
  // Preserve paragraph and line breaks, drop everything else.
  let s = xml;
  s = s.replace(/<\/w:p>/g, '\n\n');       // paragraph end
  s = s.replace(/<\/a:p>/g, '\n');         // PPTX paragraph end
  s = s.replace(/<w:br\s*\/?>/g, '\n');    // line break
  s = s.replace(/<w:tab\s*\/?>/g, '\t');   // tab
  s = s.replace(/<[^>]+>/g, '');           // strip remaining tags
  s = decodeXmlEntities(s);
  return s;
}

function collapseWhitespace(s: string): string {
  return s
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ================================================================== *
 *  TEXT EXTRACTORS
 * ================================================================== */

async function extractText(uri: string): Promise<InternalExtract> {
  try {
    const raw = await readUTF8(uri);
    const text = normalizeText(raw);
    if (!text.trim()) return { ok: false, error: 'File contains no readable text.' };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: 'Could not read text file: ' + (e as Error).message };
  }
}

async function extractDocx(uri: string): Promise<InternalExtract> {
  try {
    const b64 = await readBase64(uri);
    const zip = unzipSync(base64ToBytes(b64));

    // Main document body
    const docXml = zip['word/document.xml'];
    if (!docXml) return { ok: false, error: 'Not a valid DOCX file.' };

    const body = stripXmlTags(strFromU8(docXml));

    // Optional: headers, footers, footnotes, endnotes — appended at the end.
    const extraFiles = Object.keys(zip).filter((k) =>
      /^word\/(header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(k),
    );

    let extras = '';
    for (const name of extraFiles) {
      const part = stripXmlTags(strFromU8(zip[name])).trim();
      if (part) {
        const label = name.includes('header')
          ? 'Header'
          : name.includes('footer')
            ? 'Footer'
            : name.includes('footnotes')
              ? 'Footnotes'
              : 'Endnotes';
        extras += `\n\n--- ${label} ---\n${part}`;
      }
    }

    const combined = collapseWhitespace(body + extras);
    if (!combined) return { ok: false, error: 'No text found in DOCX.' };
    return { ok: true, text: combined };
  } catch (e) {
    return { ok: false, error: 'DOCX parse failed: ' + (e as Error).message };
  }
}

async function extractPptx(uri: string): Promise<InternalExtract> {
  try {
    const b64 = await readBase64(uri);
    const zip = unzipSync(base64ToBytes(b64));

    const slideEntries = Object.keys(zip)
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .map((k) => ({ key: k, n: parseInt(k.match(/slide(\d+)/)![1], 10) }))
      .sort((a, b) => a.n - b.n);

    if (!slideEntries.length) return { ok: false, error: 'No slides found in PPTX.' };

    const parts: string[] = [];

    for (let i = 0; i < slideEntries.length; i++) {
      const { key, n } = slideEntries[i];
      const xml = strFromU8(zip[key]);
      const texts: string[] = [];
      const re = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml))) {
        const t = decodeXmlEntities(m[1]).trim();
        if (t) texts.push(t);
      }
      if (texts.length) parts.push(`Slide ${n}\n${texts.join('\n')}`);

      // Speaker notes (ppt/notesSlides/notesSlideN.xml) — same N as the slide
      const notesKey = `ppt/notesSlides/notesSlide${n}.xml`;
      if (zip[notesKey]) {
        const notesXml = strFromU8(zip[notesKey]);
        const notes: string[] = [];
        let nm: RegExpExecArray | null;
        const nre = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
        while ((nm = nre.exec(notesXml))) {
          const t = decodeXmlEntities(nm[1]).trim();
          if (t) notes.push(t);
        }
        if (notes.length) parts.push(`Slide ${n} · Notes\n${notes.join('\n')}`);
      }
    }

    const combined = collapseWhitespace(parts.join('\n\n'));
    if (!combined) return { ok: false, error: 'No text found in PPTX slides.' };
    return { ok: true, text: combined };
  } catch (e) {
    return { ok: false, error: 'PPTX parse failed: ' + (e as Error).message };
  }
}

/* ------------------------------ PDF ------------------------------ */

/** Clean up artifacts common to naive PDF text extraction. */
function cleanPdfText(s: string): string {
  return (
    s
      // Control chars (keep \n and \t)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      // Common ligatures
      .replace(/ﬁ/g, 'fi')
      .replace(/ﬂ/g, 'fl')
      .replace(/ﬀ/g, 'ff')
      .replace(/ﬃ/g, 'ffi')
      .replace(/ﬄ/g, 'ffl')
      // Soft hyphen
      .replace(/\u00AD/g, '')
      // End-of-line hyphenation: "informa-\ntion" → "information"
      .replace(/([a-z])-\n([a-z])/g, '$1$2')
      // Collapse spaces but keep paragraphs
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Extract text from a text-based PDF.
 * Handles FlateDecode-compressed content streams and literal string operands
 * inside BT/ET blocks. Does NOT do OCR (scanned PDFs will return empty).
 */
async function extractPdf(uri: string): Promise<InternalExtract> {
  try {
    const b64 = await readBase64(uri);
    const bytes = base64ToBytes(b64);

    if (bytes.length > MAX_PDF_BIN_BYTES) {
      return {
        ok: false,
        error: `PDF is larger than ${Math.round(MAX_PDF_BIN_BYTES / 1024 / 1024)} MB for text extraction. Try splitting it.`,
      };
    }

    const bin = bytesToBinaryString(bytes);

    // Match streams regardless of the exact newline after "stream".
    const streamRe = /stream\r?\n?([\s\S]*?)\r?\nendstream/g;
    const pieces: string[] = [];
    let m: RegExpExecArray | null;

    while ((m = streamRe.exec(bin))) {
      const raw = m[1];
      let decoded: string | null = null;

      // Try FlateDecode first
      try {
        const rawBytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) rawBytes[i] = raw.charCodeAt(i) & 0xff;
        decoded = strFromU8(inflateSync(rawBytes));
      } catch {
        // Not compressed — treat as raw content stream
        decoded = raw;
      }
      if (!decoded) continue;

      // Extract text-showing operators inside BT/ET blocks
      const btRe = /BT([\s\S]*?)ET/g;
      let btm: RegExpExecArray | null;
      while ((btm = btRe.exec(decoded))) {
        const block = btm[1];

        // Literal strings: (Hello)
        const litRe = /\((?:\\.|[^\\()])*\)/g;
        const line: string[] = [];
        let tm: RegExpExecArray | null;
        while ((tm = litRe.exec(block))) {
          let t = tm[0].slice(1, -1);
          t = t
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\\(/g, '(')
            .replace(/\\\)/g, ')')
            .replace(/\\\\/g, '\\');
          line.push(t);
        }

        // Hex strings: <48656C6C6F>
        const hexRe = /<([0-9A-Fa-f\s]+)>/g;
        let hm: RegExpExecArray | null;
        while ((hm = hexRe.exec(block))) {
          const hex = hm[1].replace(/\s+/g, '');
          if (hex.length % 2 !== 0) continue;
          let s = '';
          for (let i = 0; i < hex.length; i += 2) {
            s += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16));
          }
          if (s) line.push(s);
        }

        if (line.length) pieces.push(line.join(''));
      }
    }

    const cleaned = cleanPdfText(pieces.join('\n'));

    if (!cleaned) {
      return {
        ok: false,
        error:
          'No extractable text found. This PDF may be scanned (image-only) or use non-standard font encoding. Try exporting it as DOCX or TXT, or use OCR.',
      };
    }
    return { ok: true, text: cleaned };
  } catch (e) {
    return { ok: false, error: 'PDF parse failed: ' + (e as Error).message };
  }
}

/* ================================================================== *
 *  PUBLIC API — extractOnly
 * ================================================================== */

/**
 * Extract text from a file without indexing it.
 * Used by the chat composer for inline attachments.
 */
export async function extractOnly(
  uri: string,
  name: string,
  opts: ImportOptions = {},
): Promise<ExtractResult> {
  const { signal } = opts;
  try {
    throwIfAborted(signal);
    const ext = getExtension(name);

    let result: InternalExtract;
    const run = (fn: () => Promise<InternalExtract>) =>
      withGuards(fn(), signal);

    if (TEXT_EXTS.has(ext)) result = await run(() => extractText(uri));
    else if (ext === 'docx') result = await run(() => extractDocx(uri));
    else if (ext === 'pptx') result = await run(() => extractPptx(uri));
    else if (ext === 'pdf') result = await run(() => extractPdf(uri));
    else if (ext === 'doc' || ext === 'ppt') {
      return {
        ok: false,
        reason: `Legacy .${ext} files aren't supported. Resave as .${ext}x in Word/PowerPoint.`,
      };
    } else {
      return {
        ok: false,
        reason: `Unsupported file type ".${ext}". Supported: PDF, DOCX, PPTX, TXT, MD, CSV, JSON, HTML, XML.`,
      };
    }

    if (!result.ok) return { ok: false, reason: result.error };

    let text = result.text;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + '\n\n…[truncated]';
    }
    return { ok: true, text, chars: text.length };
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') return { ok: false, reason: 'cancelled' };
    return { ok: false, reason: err.message };
  }
}

/* ================================================================== *
 *  PUBLIC API — importDocument
 * ================================================================== */

/**
 * Open the file picker, extract text locally, chunk it, and store it.
 * The user's DocumentsScreen only needs the `ok`, `name`, and `chunks` fields.
 */
export async function importDocument(
  opts: ImportOptions = {},
): Promise<ImportResult> {
  const started = Date.now();
  const { signal, onProgress } = opts;

  const report = (stage: ImportProgress['stage'], progress: number) => {
    try {
      onProgress?.({ stage, progress });
    } catch {
      /* ignore listener errors */
    }
  };

  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.length) {
      return { ok: false, reason: 'cancelled', cancelled: true };
    }

    const asset = res.assets[0];
    const name = sanitizeFilename(asset.name);
    const ext = getExtension(name);

    if ((asset.size ?? 0) > MAX_BYTES) {
      return {
        ok: false,
        reason: `File is larger than ${Math.round(MAX_BYTES / 1024 / 1024)} MB. Split it into smaller files.`,
      };
    }

    throwIfAborted(signal);
    report('reading', 0.1);

    // ---- extract ----
    let result: InternalExtract;
    const run = (fn: () => Promise<InternalExtract>) =>
      withGuards(fn(), signal);

    if (TEXT_EXTS.has(ext)) result = await run(() => extractText(asset.uri));
    else if (ext === 'docx') result = await run(() => extractDocx(asset.uri));
    else if (ext === 'pptx') result = await run(() => extractPptx(asset.uri));
    else if (ext === 'pdf') result = await run(() => extractPdf(asset.uri));
    else if (ext === 'doc' || ext === 'ppt') {
      return {
        ok: false,
        reason: `Legacy .${ext} files aren't supported. Resave as .${ext}x in Word/PowerPoint.`,
      };
    } else {
      return {
        ok: false,
        reason: `Unsupported file type ".${ext}". Supported: PDF, DOCX, PPTX, TXT, MD, CSV, JSON, HTML, XML.`,
      };
    }

    if (!result.ok) return { ok: false, reason: result.error };
    report('extracting', 0.6);

    // ---- truncate if needed ----
    let text = result.text;
    if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);

    throwIfAborted(signal);

    // ---- chunk ----
    const chunks = chunkText(text);
    if (!chunks.length) {
      return { ok: false, reason: 'The file contains no readable text.' };
    }
    report('chunking', 0.8);

    // ---- store ----
    await addDocument(name, chunks);
    report('storing', 1);

    // Clean up the cached copy (fire-and-forget)
    FS.deleteAsync(asset.uri, { idempotent: true }).catch(() => {});

    return {
      ok: true,
      name,
      chunks: chunks.length,
      chars: text.length,
      ms: Date.now() - started,
    };
  } catch (e) {
    const err = e as Error;
    if (err.name === 'AbortError') {
      return { ok: false, reason: 'cancelled', cancelled: true };
    }
    return { ok: false, reason: err.message };
  }
}

/* ================================================================== *
 *  RETRIEVAL
 * ================================================================== */

export interface Retrieved {
  chunk: ChunkRow;
  score: number;
}

/**
 * Retrieve the top-k most relevant chunks for a query.
 * Uses in-memory BM25. Fine for libraries up to a few thousand chunks.
 */
export async function retrieve(query: string, k = 4): Promise<Retrieved[]> {
  const q = (query ?? '').trim();
  if (!q) return [];
  const all = await getAllChunks();
  if (!all.length) return [];
  const ranked = rank(q, all, Math.max(1, k));
  return ranked.map((r) => ({ chunk: r.item, score: r.score }));
}