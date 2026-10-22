/* ------------------------------------------------------------------ *
 *  Shared types. Central contract for every module in the app.
 *  Keep this file dependency-free (no imports from other local files).
 * ------------------------------------------------------------------ */

/* ------------------------------- roles ------------------------------- */

export type Role = 'system' | 'user' | 'assistant';

/* ------------------------------ language ----------------------------- */

export type Language = 'en' | 'ur' | 'ur-roman';

export const LANGUAGES: readonly Language[] = ['en', 'ur', 'ur-roman'] as const;

export const LANGUAGE_LABELS: Record<Language, { label: string; sub: string }> = {
  en: { label: 'English', sub: 'Default' },
  ur: { label: 'اردو', sub: 'Urdu' },
  'ur-roman': { label: 'Roman Urdu', sub: 'Urdu in English' },
};

/* --------------------------- conversations --------------------------- */

export interface Conversation {
  id: string;
  title: string;
  presetId: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

/* ---------------------------- attachments ---------------------------- */

export type AttachmentKind = 'image' | 'document';

export interface Attachment {
  /** Stable random ID — used as React key and for removal. */
  id: string;
  kind: AttachmentKind;
  /** Original filename (or synthesized name for photos). */
  name: string;
  /** Local file URI (file:// on Android). */
  uri: string;
  /** Byte size, if the picker reports it. */
  size?: number;
  /** e.g. "application/pdf", "image/jpeg". */
  mimeType?: string;
  /**
   * Extracted plain text for documents.
   * Undefined for images (vision models aren't supported yet).
   * Truncated to a safe inline size by the caller.
   */
  text?: string;
}

/* ------------------------------- messages ---------------------------- */

export interface Message {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  /** JSON string of SourceRef[] when answered from documents. */
  sources: string | null;
  /** JSON string of Attachment[] when the message has attachments. */
  attachments?: string | null;
  createdAt: number;
}

export interface SourceRef {
  n: number;
  doc: string;
  snippet: string;
}

/* ----------------------------- documents ----------------------------- */

export interface DocRecord {
  id: number;
  name: string;
  chars: number;
  chunkCount: number;
  createdAt: number;
}

export interface ChunkRow {
  id: number;
  docId: number;
  docName: string;
  idx: number;
  text: string;
}

/* ------------------------------ memories ----------------------------- */

export interface MemoryItem {
  id: number;
  text: string;
  createdAt: number;
}

/* ------------------------------- profile ----------------------------- */

export type ResponseStyle = 'concise' | 'balanced' | 'detailed';
export type TonePreference = 'friendly' | 'professional' | 'casual';
export type ExpertiseLevel = 'beginner' | 'intermediate' | 'expert';

export interface ProfilePreferences {
  responseStyle: ResponseStyle;
  tone: TonePreference;
  expertise: ExpertiseLevel;
}

export interface ProfileStats {
  /** Lifetime count of conversations started by the user. */
  conversationsStarted: number;
  /** Lifetime count of user-sent messages. */
  messagesSent: number;
  /** Lifetime count of documents imported. */
  documentsImported: number;
  /** IDs of models the user has activated at least once. */
  modelsTried: string[];
  /** Epoch ms of first use — set once on first launch. */
  firstUsedAt: number | null;
  /** Epoch ms of last app activity — updated on focus. */
  lastActiveAt: number | null;
}

export interface Profile {
  /** Display name. Empty string if the user hasn't set one. */
  name: string;
  /** AI-generated short description, in third person. */
  bio: string;
  /** Local file URI of the profile photo, or null. */
  avatarUri: string | null;
  /** Optional short text fields. */
  occupation: string;
  location: string;
  /** How the AI should respond to this user. */
  preferences: ProfilePreferences;
  /** Lifetime activity counters. */
  stats: ProfileStats;
  /** Epoch ms when the bio was last generated, or null. */
  generatedAt: number | null;
  /** Epoch ms when the profile was last updated. */
  updatedAt: number;
}

export const DEFAULT_PROFILE_PREFERENCES: ProfilePreferences = {
  responseStyle: 'balanced',
  tone: 'friendly',
  expertise: 'intermediate',
};

export const DEFAULT_PROFILE_STATS: ProfileStats = {
  conversationsStarted: 0,
  messagesSent: 0,
  documentsImported: 0,
  modelsTried: [],
  firstUsedAt: null,
  lastActiveAt: null,
};

export const DEFAULT_PROFILE: Profile = {
  name: '',
  bio: '',
  avatarUri: null,
  occupation: '',
  location: '',
  preferences: DEFAULT_PROFILE_PREFERENCES,
  stats: DEFAULT_PROFILE_STATS,
  generatedAt: null,
  updatedAt: 0,
};

/* ----------------------- preference metadata -------------------------- */

export const RESPONSE_STYLES: readonly {
  id: ResponseStyle;
  label: string;
  sub: string;
}[] = [
  { id: 'concise', label: 'Concise', sub: 'Short, to the point' },
  { id: 'balanced', label: 'Balanced', sub: 'Clear but complete' },
  { id: 'detailed', label: 'Detailed', sub: 'Thorough with examples' },
] as const;

export const TONE_PREFERENCES: readonly {
  id: TonePreference;
  label: string;
  sub: string;
}[] = [
  { id: 'friendly', label: 'Friendly', sub: 'Warm and encouraging' },
  { id: 'professional', label: 'Professional', sub: 'Neutral and precise' },
  { id: 'casual', label: 'Casual', sub: 'Relaxed and informal' },
] as const;

export const EXPERTISE_LEVELS: readonly {
  id: ExpertiseLevel;
  label: string;
  sub: string;
}[] = [
  { id: 'beginner', label: 'Beginner', sub: 'Avoid jargon' },
  { id: 'intermediate', label: 'Intermediate', sub: 'Standard depth' },
  { id: 'expert', label: 'Expert', sub: 'Skip the basics' },
] as const;

/* ------------------------------ settings ----------------------------- */

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  theme: ThemePref;
  maxTokens: number;
  temperature: number;
  contextSize: number;
  useMemory: boolean;
  wifiOnly: boolean;
  activeModelId: string | null;
  language: Language;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  maxTokens: 512,
  temperature: 0.7,
  contextSize: 4096,
  useMemory: true,
  wifiOnly: true,
  activeModelId: null,
  language: 'en',
};

/* ------------------------------- models ------------------------------ */

export interface ModelState {
  status: 'none' | 'downloading' | 'paused' | 'ready';
  /** 0..1 */
  progress: number;
  /** Bytes downloaded so far. */
  bytes: number;
  /** Error message, if the last attempt failed. */
  error?: string;
}

export const DEFAULT_MODEL_STATE: ModelState = {
  status: 'none',
  progress: 0,
  bytes: 0,
};

/* ---------------------------- safe parsers --------------------------- */

/**
 * Parse the JSON-encoded sources field on a Message.
 * Never throws — returns [] on any error.
 */
export function parseSources(json: string | null | undefined): SourceRef[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as SourceRef[]) : [];
  } catch {
    return [];
  }
}

/**
 * Parse the JSON-encoded attachments field on a Message.
 * Never throws — returns [] on any error.
 */
export function parseAttachments(
  json: string | null | undefined,
): Attachment[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as Attachment[]) : [];
  } catch {
    return [];
  }
}

/* --------------------------- type helpers ---------------------------- */

/** Type guard: is this value a Message? */
export function isMessage(v: unknown): v is Message {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Message).id === 'string' &&
    typeof (v as Message).content === 'string' &&
    typeof (v as Message).role === 'string'
  );
}

/** Type guard: is this value a Conversation? */
export function isConversation(v: unknown): v is Conversation {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Conversation).id === 'string' &&
    typeof (v as Conversation).title === 'string'
  );
}

/** Type guard: is this value a valid Language? */
export function isLanguage(v: unknown): v is Language {
  return v === 'en' || v === 'ur' || v === 'ur-roman';
}

/** Type guard: is this value a valid Profile? */
export function isProfile(v: unknown): v is Profile {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Profile).name === 'string' &&
    typeof (v as Profile).bio === 'string'
  );
}

/** Type guard: is this value a valid ResponseStyle? */
export function isResponseStyle(v: unknown): v is ResponseStyle {
  return v === 'concise' || v === 'balanced' || v === 'detailed';
}

/** Type guard: is this value a valid TonePreference? */
export function isTonePreference(v: unknown): v is TonePreference {
  return v === 'friendly' || v === 'professional' || v === 'casual';
}

/** Type guard: is this value a valid ExpertiseLevel? */
export function isExpertiseLevel(v: unknown): v is ExpertiseLevel {
  return v === 'beginner' || v === 'intermediate' || v === 'expert';
}

/* ---------------------------- normalizers ---------------------------- */

/**
 * Coerce any unknown value into a fully-shaped ProfilePreferences object.
 * Safe against null, undefined, partial, or malformed input.
 */
export function normalizePreferences(
  v: unknown,
): ProfilePreferences {
  const p = v as Partial<ProfilePreferences> | undefined;
  return {
    responseStyle: isResponseStyle(p?.responseStyle)
      ? p!.responseStyle!
      : DEFAULT_PROFILE_PREFERENCES.responseStyle,
    tone: isTonePreference(p?.tone)
      ? p!.tone!
      : DEFAULT_PROFILE_PREFERENCES.tone,
    expertise: isExpertiseLevel(p?.expertise)
      ? p!.expertise!
      : DEFAULT_PROFILE_PREFERENCES.expertise,
  };
}

/**
 * Coerce any unknown value into a fully-shaped ProfileStats object.
 * Safe against null, undefined, partial, or malformed input.
 */
export function normalizeStats(v: unknown): ProfileStats {
  const s = v as Partial<ProfileStats> | undefined;
  return {
    conversationsStarted:
      typeof s?.conversationsStarted === 'number' &&
      Number.isFinite(s.conversationsStarted)
        ? Math.max(0, Math.floor(s.conversationsStarted))
        : 0,
    messagesSent:
      typeof s?.messagesSent === 'number' && Number.isFinite(s.messagesSent)
        ? Math.max(0, Math.floor(s.messagesSent))
        : 0,
    documentsImported:
      typeof s?.documentsImported === 'number' &&
      Number.isFinite(s.documentsImported)
        ? Math.max(0, Math.floor(s.documentsImported))
        : 0,
    modelsTried: Array.isArray(s?.modelsTried)
      ? s!.modelsTried!.filter((x): x is string => typeof x === 'string')
      : [],
    firstUsedAt:
      typeof s?.firstUsedAt === 'number' && Number.isFinite(s.firstUsedAt)
        ? s.firstUsedAt
        : null,
    lastActiveAt:
      typeof s?.lastActiveAt === 'number' && Number.isFinite(s.lastActiveAt)
        ? s.lastActiveAt
        : null,
  };
}

/**
 * Coerce any unknown value into a fully-shaped Profile object.
 * Guaranteed to return a valid Profile — never throws.
 */
export function normalizeProfile(v: unknown): Profile {
  const p = v as Partial<Profile> | undefined;
  return {
    name: typeof p?.name === 'string' ? p.name : '',
    bio: typeof p?.bio === 'string' ? p.bio : '',
    avatarUri: typeof p?.avatarUri === 'string' ? p.avatarUri : null,
    occupation: typeof p?.occupation === 'string' ? p.occupation : '',
    location: typeof p?.location === 'string' ? p.location : '',
    preferences: normalizePreferences(p?.preferences),
    stats: normalizeStats(p?.stats),
    generatedAt:
      typeof p?.generatedAt === 'number' && Number.isFinite(p.generatedAt)
        ? p.generatedAt
        : null,
    updatedAt:
      typeof p?.updatedAt === 'number' && Number.isFinite(p.updatedAt)
        ? p.updatedAt
        : 0,
  };
}