import * as SQLite from 'expo-sqlite';
import type {
  ChunkRow,
  Conversation,
  DocRecord,
  MemoryItem,
  Message,
  Profile,
  Role,
} from '../../types';
import { normalizeProfile } from '../../types';

/* ================================================================== *
 *  SCHEMA
 * ================================================================== */

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  preset_id TEXT NOT NULL DEFAULT 'general',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_conv_updated
  ON conversations(archived, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  sources TEXT,
  attachments TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv
  ON messages(conversation_id, created_at, rowid);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  chars INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_created
  ON documents(created_at DESC);

CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc
  ON chunks(doc_id, idx);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_created
  ON memories(created_at DESC);

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

/* ================================================================== *
 *  CONNECTION
 * ================================================================== */

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openAndPrepare(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('assistant.db');
  await db.execAsync(SCHEMA);
  await runMigrations(db);
  return db;
}

/**
 * Idempotent migrations for existing installs. Safe to run on every launch —
 * each migration checks the current schema first.
 */
async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  // 1. messages.attachments (added in v1.1)
  try {
    const cols = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(messages)',
    );
    if (!cols.some((c) => c.name === 'attachments')) {
      await db.execAsync('ALTER TABLE messages ADD COLUMN attachments TEXT');
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[db] attachment migration failed', e);
  }
}

/**
 * Get the database handle. If opening fails, the failed promise is discarded
 * so the next call retries cleanly instead of returning a broken handle.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndPrepare().catch((err) => {
      dbPromise = null; // allow retry on next call
      throw err;
    });
  }
  return dbPromise;
}

/**
 * Close the database (useful before a full data wipe or on logout).
 * Safe to call even if the DB was never opened.
 */
export async function closeDb(): Promise<void> {
  const current = dbPromise;
  dbPromise = null;
  if (!current) return;
  try {
    const db = await current;
    await db.closeAsync();
  } catch {
    /* ignore */
  }
}

/**
 * Force a WAL checkpoint. Called opportunistically to keep the -wal file
 * from growing indefinitely on long sessions.
 */
export async function checkpoint(): Promise<void> {
  try {
    const db = await getDb();
    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch {
    /* ignore */
  }
}

/* ================================================================== *
 *  UTILITIES
 * ================================================================== */

/** Collision-safe id. Prefer this over Math.random alone. */
export function uid(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6)
  );
}

/** Run a callback inside a transaction. Rolls back on throw. */
async function tx<T>(fn: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const db = await getDb();
  let result: T | undefined;
  let error: unknown = null;
  await db.withTransactionAsync(async () => {
    try {
      result = await fn(db);
    } catch (e) {
      error = e;
      throw e; // triggers rollback
    }
  });
  if (error) throw error;
  return result as T;
}

/* ================================================================== *
 *  CONVERSATIONS
 * ================================================================== */

interface ConvRow {
  id: string;
  title: string;
  preset_id: string;
  created_at: number;
  updated_at: number;
  archived: number;
}

const toConv = (r: ConvRow): Conversation => ({
  id: r.id,
  title: r.title,
  presetId: r.preset_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  archived: !!r.archived,
});

export async function createConversation(
  title: string,
  presetId: string,
): Promise<Conversation> {
  const db = await getDb();
  const now = Date.now();
  const id = uid();
  const safeTitle = (title || 'New chat').trim().slice(0, 200) || 'New chat';

  await db.runAsync(
    `INSERT INTO conversations (id,title,preset_id,created_at,updated_at,archived)
     VALUES (?,?,?,?,?,0)`,
    [id, safeTitle, presetId, now, now],
  );
  return {
    id,
    title: safeTitle,
    presetId,
    createdAt: now,
    updatedAt: now,
    archived: false,
  };
}

export async function listConversations(
  query = '',
  archived = false,
  limit = 200,
  offset = 0,
): Promise<Conversation[]> {
  const db = await getDb();
  const q = query.trim();
  const a = archived ? 1 : 0;

  const rows = q
    ? await db.getAllAsync<ConvRow>(
        `SELECT DISTINCT c.* FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
         WHERE c.archived = ?
           AND (c.title LIKE ? OR m.content LIKE ?)
         ORDER BY c.updated_at DESC
         LIMIT ? OFFSET ?`,
        [a, `%${q}%`, `%${q}%`, limit, offset],
      )
    : await db.getAllAsync<ConvRow>(
        `SELECT * FROM conversations
         WHERE archived = ?
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`,
        [a, limit, offset],
      );
  return rows.map(toConv);
}

export async function countConversations(archived = false): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM conversations WHERE archived = ?',
    [archived ? 1 : 0],
  );
  return r?.n ?? 0;
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<ConvRow>(
    'SELECT * FROM conversations WHERE id = ? LIMIT 1',
    [id],
  );
  return r ? toConv(r) : null;
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const clean = (title || '').trim().slice(0, 200);
  if (!clean) return;
  const db = await getDb();
  await db.runAsync(
    'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?',
    [clean, Date.now(), id],
  );
}

export async function setArchived(id: string, archived: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE conversations SET archived = ? WHERE id = ?', [
    archived ? 1 : 0,
    id,
  ]);
}

export async function setConversationPreset(
  id: string,
  presetId: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE conversations SET preset_id = ? WHERE id = ?', [
    presetId,
    id,
  ]);
}

export async function deleteConversation(id: string): Promise<void> {
  await tx(async (db) => {
    await db.runAsync('DELETE FROM messages WHERE conversation_id = ?', [id]);
    await db.runAsync('DELETE FROM conversations WHERE id = ?', [id]);
  });
}

/* ================================================================== *
 *  MESSAGES
 * ================================================================== */

interface MsgRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  sources: string | null;
  attachments: string | null;
  created_at: number;
}

const toMsg = (r: MsgRow): Message => ({
  id: r.id,
  conversationId: r.conversation_id,
  role: r.role as Role,
  content: r.content,
  sources: r.sources,
  attachments: r.attachments ?? null,
  createdAt: r.created_at,
});

export async function addMessage(
  conversationId: string,
  role: Role,
  content: string,
  sources: string | null = null,
  attachments: string | null = null,
): Promise<Message> {
  const db = await getDb();
  const id = uid();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO messages
       (id,conversation_id,role,content,sources,attachments,created_at)
     VALUES (?,?,?,?,?,?,?)`,
    [id, conversationId, role, content, sources, attachments, now],
  );
  await db.runAsync('UPDATE conversations SET updated_at = ? WHERE id = ?', [
    now,
    conversationId,
  ]);
  return {
    id,
    conversationId,
    role,
    content,
    sources,
    attachments,
    createdAt: now,
  };
}

export async function updateMessage(
  id: string,
  content: string,
  sources: string | null = null,
  attachments: string | null = null,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE messages SET content = ?, sources = ?, attachments = ? WHERE id = ?',
    [content, sources, attachments, id],
  );
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM messages WHERE id = ?', [id]);
}

export async function listMessages(
  conversationId: string,
  limit = 500,
  offset = 0,
): Promise<Message[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<MsgRow>(
    `SELECT * FROM messages
     WHERE conversation_id = ?
     ORDER BY created_at ASC, rowid ASC
     LIMIT ? OFFSET ?`,
    [conversationId, limit, offset],
  );
  return rows.map(toMsg);
}

/* ================================================================== *
 *  DOCUMENTS
 * ================================================================== */

export async function addDocument(
  name: string,
  chunks: string[],
): Promise<DocRecord> {
  if (!chunks.length) {
    throw new Error('Cannot add a document with no chunks.');
  }
  const cleanName = (name || 'Untitled').trim().slice(0, 300) || 'Untitled';
  const now = Date.now();
  const chars = chunks.reduce((n, c) => n + c.length, 0);

  const docId = await tx(async (db) => {
    const res = await db.runAsync(
      'INSERT INTO documents (name,chars,created_at) VALUES (?,?,?)',
      [cleanName, chars, now],
    );
    const id = res.lastInsertRowId;

    // Bulk insert in batches of 50 (SQLite parameter limit is 999).
    const BATCH = 50;
    for (let start = 0; start < chunks.length; start += BATCH) {
      const slice = chunks.slice(start, start + BATCH);
      const placeholders = slice.map(() => '(?,?,?)').join(',');
      const params: (number | string)[] = [];
      for (let i = 0; i < slice.length; i++) {
        params.push(id, start + i, slice[i]);
      }
      await db.runAsync(
        `INSERT INTO chunks (doc_id,idx,text) VALUES ${placeholders}`,
        params,
      );
    }
    return id;
  });

  return {
    id: docId,
    name: cleanName,
    chars,
    chunkCount: chunks.length,
    createdAt: now,
  };
}

export async function listDocuments(): Promise<DocRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number;
    name: string;
    chars: number;
    created_at: number;
    n: number;
  }>(
    `SELECT d.id, d.name, d.chars, d.created_at, COUNT(c.id) AS n
     FROM documents d
     LEFT JOIN chunks c ON c.doc_id = d.id
     GROUP BY d.id
     ORDER BY d.created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    chars: r.chars,
    chunkCount: r.n,
    createdAt: r.created_at,
  }));
}

export async function countDocuments(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM documents',
  );
  return r?.n ?? 0;
}

export async function deleteDocument(id: number): Promise<void> {
  await tx(async (db) => {
    await db.runAsync('DELETE FROM chunks WHERE doc_id = ?', [id]);
    await db.runAsync('DELETE FROM documents WHERE id = ?', [id]);
  });
}

export async function getAllChunks(): Promise<ChunkRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number;
    doc_id: number;
    name: string;
    idx: number;
    text: string;
  }>(
    `SELECT c.id, c.doc_id, d.name AS name, c.idx, c.text
     FROM chunks c
     JOIN documents d ON d.id = c.doc_id
     ORDER BY c.doc_id, c.idx`,
  );
  return rows.map((r) => ({
    id: r.id,
    docId: r.doc_id,
    docName: r.name,
    idx: r.idx,
    text: r.text,
  }));
}

/* ================================================================== *
 *  MEMORIES
 * ================================================================== */

export async function listMemories(): Promise<MemoryItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number;
    text: string;
    created_at: number;
  }>('SELECT * FROM memories ORDER BY created_at DESC');
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    createdAt: r.created_at,
  }));
}

export async function addMemory(text: string): Promise<void> {
  const clean = (text || '').trim();
  if (!clean) return;
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO memories (text, created_at) VALUES (?,?)',
    [clean.slice(0, 500), Date.now()],
  );
}

export async function deleteMemory(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM memories WHERE id = ?', [id]);
}

export async function clearMemories(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM memories');
}

export async function countMemories(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM memories',
  );
  return r?.n ?? 0;
}

/* ================================================================== *
 *  KEY-VALUE
 * ================================================================== */

export async function kvGet<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM kv WHERE key = ? LIMIT 1',
    [key],
  );
  if (!r) return null;
  try {
    return JSON.parse(r.value) as T;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)', [
    key,
    JSON.stringify(value),
  ]);
}

export async function kvDelete(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM kv WHERE key = ?', [key]);
}

/* ================================================================== *
 *  PROFILE
 * ================================================================== */

/**
 * Load the user profile. Always returns a fully-shaped object —
 * tolerates legacy shapes, null, and malformed JSON.
 */
export async function loadProfile(): Promise<Profile> {
  const stored = await kvGet<Profile>('profile');
  return normalizeProfile(stored);
}

/**
 * Persist the profile. Normalizes before writing so stored shape is
 * always consistent, regardless of caller.
 */
export async function saveProfile(p: Profile): Promise<void> {
  const safe = normalizeProfile(p);
  safe.updatedAt = Date.now();
  await kvSet('profile', safe);
}

/**
 * Live counts from the actual database — always accurate.
 * Use this instead of the stored counters when you need exact numbers.
 */
export async function getProfileStats(): Promise<{
  conversations: number;
  messages: number;
  documents: number;
  memories: number;
}> {
  const db = await getDb();
  const [conv, msg, doc, mem] = await Promise.all([
    db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM conversations',
    ),
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM messages'),
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM documents'),
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM memories'),
  ]);
  return {
    conversations: conv?.n ?? 0,
    messages: msg?.n ?? 0,
    documents: doc?.n ?? 0,
    memories: mem?.n ?? 0,
  };
}

/**
 * Touch the profile: updates `lastActiveAt` and initializes `firstUsedAt`
 * if this is the first launch. Cheap and safe to call on every app focus.
 */
export async function touchProfile(): Promise<void> {
  try {
    const p = await loadProfile();
    const now = Date.now();
    p.stats.firstUsedAt = p.stats.firstUsedAt ?? now;
    p.stats.lastActiveAt = now;
    // Direct write — skip the normalize step to save a millisecond
    await kvSet('profile', { ...p, updatedAt: now });
  } catch {
    /* non-fatal */
  }
}

/**
 * Record that the user has activated a model. Idempotent — a model is only
 * tracked once. Safe to call from anywhere.
 */
export async function trackModelTried(modelId: string): Promise<void> {
  if (!modelId) return;
  try {
    const p = await loadProfile();
    if (!p.stats.modelsTried.includes(modelId)) {
      p.stats.modelsTried = [...p.stats.modelsTried, modelId];
      p.updatedAt = Date.now();
      await kvSet('profile', p);
    }
  } catch {
    /* non-fatal */
  }
}

/* ================================================================== *
 *  STATS & MAINTENANCE
 * ================================================================== */

export interface DbStats {
  conversations: number;
  messages: number;
  documents: number;
  chunks: number;
  memories: number;
  /** Approximate on-disk size in bytes (page_count × page_size). */
  sizeBytes: number;
}

export async function getStats(): Promise<DbStats> {
  const db = await getDb();
  const [conv, msg, doc, chk, mem, pageCount, pageSize] = await Promise.all([
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM conversations'),
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM messages'),
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM documents'),
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM chunks'),
    db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM memories'),
    db.getFirstAsync<{ page_count: number }>('PRAGMA page_count'),
    db.getFirstAsync<{ page_size: number }>('PRAGMA page_size'),
  ]);

  const bytes =
    (pageCount?.page_count ?? 0) * (pageSize?.page_size ?? 4096);

  return {
    conversations: conv?.n ?? 0,
    messages: msg?.n ?? 0,
    documents: doc?.n ?? 0,
    chunks: chk?.n ?? 0,
    memories: mem?.n ?? 0,
    sizeBytes: bytes,
  };
}

/** Vacuum the database — reclaims space after big deletions. Slow; use sparingly. */
export async function vacuum(): Promise<void> {
  const db = await getDb();
  await db.execAsync('VACUUM');
}

/** Analyze query plans — improves index usage after bulk inserts. */
export async function analyze(): Promise<void> {
  const db = await getDb();
  await db.execAsync('ANALYZE');
}

/* ================================================================== *
 *  WIPE / RESET
 * ================================================================== */

/**
 * Deletes conversations, messages, documents, chunks, and memories.
 * Preserves the user's profile identity (name, avatar, bio, preferences)
 * but resets stat counters that tracked the deleted data.
 */
export async function wipeUserData(): Promise<void> {
  await tx(async (db) => {
    await db.runAsync('DELETE FROM messages');
    await db.runAsync('DELETE FROM conversations');
    await db.runAsync('DELETE FROM chunks');
    await db.runAsync('DELETE FROM documents');
    await db.runAsync('DELETE FROM memories');
  });
  await checkpoint();

  // Reset stored stat counters (identity + preferences survive)
  try {
    const p = await loadProfile();
    p.stats.conversationsStarted = 0;
    p.stats.messagesSent = 0;
    p.stats.documentsImported = 0;
    p.updatedAt = Date.now();
    await kvSet('profile', p);
  } catch {
    /* non-fatal */
  }
}

/**
 * Full reset — wipes user data AND profile AND settings. Use on "factory reset".
 */
export async function factoryReset(): Promise<void> {
  await tx(async (db) => {
    await db.runAsync('DELETE FROM messages');
    await db.runAsync('DELETE FROM conversations');
    await db.runAsync('DELETE FROM chunks');
    await db.runAsync('DELETE FROM documents');
    await db.runAsync('DELETE FROM memories');
    await db.runAsync('DELETE FROM kv');
  });
  await checkpoint();
}