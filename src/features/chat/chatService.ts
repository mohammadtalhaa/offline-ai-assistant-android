import {
  listMemories,
  loadProfile,
  updateMessage,
} from '../../services/database/db';
import type { Message, Profile, Settings, SourceRef } from '../../types';
import { estimateTokens } from '../../utils/format';
import { getEngine, type ChatMsg } from '../inference';
import { retrieve } from '../retrieval/documents';
import { getPreset } from './presets';

/* ------------------------------ constants ------------------------------ */

const STREAM_FLUSH_MS = 60;
const MAX_MEMORY_FACTS = 20;
const MAX_MEMORY_CHARS = 800;      // cap total memory injected into system prompt
const MIN_BUDGET = 512;            // floor so we never send an empty prompt
const SAFETY_MARGIN_TOKENS = 96;   // headroom for tokenizer estimation error
const MAX_DOC_SNIPPETS = 6;

/* -------------------------------- types -------------------------------- */

export interface GenerateArgs {
  assistantId: string;
  presetId: string;
  history: Pick<Message, 'role' | 'content'>[];
  settings: Settings;
  useDocs: boolean;
  onPartial: (text: string) => void;
  /** Optional abort signal from the caller (e.g. Stop button). */
  signal?: AbortSignal;
}

export interface GenerateOut {
  text: string;
  sources: string | null;
  tokensPerSecond?: number;
  /** True when generation was stopped before completing. */
  aborted?: boolean;
}

interface BuiltMessages {
  messages: ChatMsg[];
  sources: SourceRef[];
  noEvidence: boolean;
}

/* ================================================================== *
 *  BUILD MESSAGES
 * ================================================================== */

export async function buildMessages(
  a: Pick<
    GenerateArgs,
    'presetId' | 'history' | 'settings' | 'useDocs'
  >,
): Promise<BuiltMessages> {
  const preset = getPreset(a.presetId);
  const systemParts: string[] = [preset.system];

  /* --------------------- 1. Language instruction -------------------- */

  systemParts.push(languageInstruction(a.settings.language));

  /* --------------------- 2. Profile preferences --------------------- */

  try {
    const profile = await loadProfile();
    const prefText = profilePreferencesInstruction(profile);
    if (prefText) systemParts.push(prefText);
  } catch {
    /* non-fatal — preferences are a nice-to-have */
  }

  /* ---------------------- 3. Memory injection ----------------------- */

  if (a.settings.useMemory) {
    try {
      const mem = await listMemories();
      if (mem.length) {
        const lines: string[] = [];
        let chars = 0;
        for (const m of mem.slice(0, MAX_MEMORY_FACTS)) {
          const clean = m.text.replace(/\s+/g, ' ').trim().slice(0, 200);
          if (!clean) continue;
          if (chars + clean.length > MAX_MEMORY_CHARS) break;
          lines.push(`- ${clean}`);
          chars += clean.length;
        }
        if (lines.length) {
          systemParts.push(
            'Facts the user asked you to remember:\n' + lines.join('\n'),
          );
        }
      }
    } catch {
      /* non-fatal */
    }
  }

  /* --------------------- 4. Document retrieval ---------------------- */

  const sources: SourceRef[] = [];
  let noEvidence = false;

  if (a.useDocs) {
    const lastUser =
      [...a.history].reverse().find((m) => m.role === 'user')?.content ?? '';

    if (!lastUser.trim()) {
      noEvidence = true;
      systemParts.push(
        'The user has not asked a question yet. Politely ask what they would like to know about their documents.',
      );
    } else {
      const k = a.settings.contextSize <= 2048 ? 2 : MAX_DOC_SNIPPETS;
      let hits: Awaited<ReturnType<typeof retrieve>> = [];
      try {
        hits = await retrieve(lastUser, k);
      } catch {
        hits = [];
      }

      if (!hits.length) {
        noEvidence = true;
        systemParts.push(
          'The user enabled document search but no relevant passages were found. Say that nothing relevant was found in their documents, then answer cautiously from general knowledge and clearly label it as such.',
        );
      } else {
        hits.forEach((h, i) => {
          sources.push({
            n: i + 1,
            doc: h.chunk.docName,
            snippet: h.chunk.text.slice(0, 220),
          });
        });
        systemParts.push(
          'Answer using ONLY the numbered excerpts below. Cite them like [1]. If the excerpts do not contain the answer, say so plainly.\n\n' +
            hits
              .map((h, i) => `[${i + 1}] (${h.chunk.docName})\n${h.chunk.text}`)
              .join('\n\n'),
        );
      }
    }
  }

  /* -------------------- 5. Assemble system prompt ------------------- */

  const system = systemParts.filter(Boolean).join('\n\n');

  /* --------------------- 6. Trim history to fit --------------------- */

  const trimmed = trimHistoryToBudget({
    history: a.history,
    system,
    contextSize: a.settings.contextSize,
    reserveForOutput: a.settings.maxTokens,
  });

  return {
    messages: [{ role: 'system', content: system }, ...trimmed],
    sources,
    noEvidence,
  };
}

/* ================================================================== *
 *  GENERATE REPLY
 * ================================================================== */

/**
 * Runs one generation, streams partial text, and persists the final
 * assistant message. Safe against aborts, timeouts, and partial failures.
 */
export async function generateReply(a: GenerateArgs): Promise<GenerateOut> {
  const sourcesJson = (() => {
    /* placeholder — filled after buildMessages */
    return null as string | null;
  })();

  const { messages, sources, noEvidence } = await buildMessages(a);
  const sourcesFinal = sources.length ? JSON.stringify(sources) : null;

  const engine = getEngine();

  /* ----------------------- streaming accumulator ------------------- */

  let acc = '';
  let aborted = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushNow = () => {
    flushTimer = null;
    try {
      a.onPartial(acc);
    } catch {
      /* consumer errors must not break generation */
    }
  };

  const scheduleFlush = () => {
    if (!flushTimer) flushTimer = setTimeout(flushNow, STREAM_FLUSH_MS);
  };

  const onAbort = () => {
    aborted = true;
    engine.stop().catch(() => {});
  };
  a.signal?.addEventListener('abort', onAbort, { once: true });

  /* --------------------------- generation ------------------------- */

  try {
    const res = await engine.generate(messages, {
      maxTokens: a.settings.maxTokens,
      temperature: a.settings.temperature,
      onToken: (t) => {
        if (aborted) return;
        acc += t;
        scheduleFlush();
      },
    });

    // Flush any pending partial text
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    let text = (res.text || acc).trim();

    // If abort happened and we have partial output, keep it
    if (aborted && !text) {
      text = '(Stopped.)';
    }

    if (!text) {
      text = '(No response generated — try rephrasing or increasing the response length in Settings.)';
    }

    if (noEvidence) {
      text = '🔎 No relevant passages found in your documents.\n\n' + text;
    }

    try {
      await updateMessage(a.assistantId, text, sourcesFinal);
    } catch {
      /* persistence failure is non-fatal — the UI already has the text */
    }

    return {
      text,
      sources: sourcesFinal,
      tokensPerSecond: res.tokensPerSecond,
      aborted,
    };
  } catch (e) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    const partial = acc.trim();
    const isAbort =
      aborted ||
      (e as Error)?.name === 'AbortError' ||
      /abort/i.test((e as Error)?.message ?? '');

    if (isAbort) {
      const text = partial || '(Stopped.)';
      try {
        await updateMessage(a.assistantId, text, sourcesFinal);
      } catch {
        /* ignore */
      }
      return { text, sources: sourcesFinal, aborted: true };
    }

    // Preserve partial output on real errors
    const errorMessage = friendlyError(e);
    const text = partial
      ? `${partial}\n\n_[interrupted: ${errorMessage}]_`
      : `⚠️ ${errorMessage}`;

    try {
      await updateMessage(a.assistantId, text, sourcesFinal);
    } catch {
      /* ignore */
    }

    return { text, sources: sourcesFinal };
  } finally {
    a.signal?.removeEventListener('abort', onAbort);
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }
}

/* ================================================================== *
 *  STOP
 * ================================================================== */

export function stopGeneration(): Promise<void> {
  try {
    return getEngine().stop();
  } catch {
    return Promise.resolve();
  }
}

/* ================================================================== *
 *  INTERNAL HELPERS
 * ================================================================== */

/** Language instruction block for the system prompt. */
function languageInstruction(lang: Settings['language']): string {
  switch (lang) {
    case 'ur':
      return 'Always respond in Urdu (اردو) using proper Urdu script, unless the user explicitly writes in another language.';
    case 'ur-roman':
      return 'Always respond in Roman Urdu (Urdu written in English letters), unless the user explicitly writes in another language. Example: "Aap kaise hain? Main theek hoon."';
    case 'en':
    default:
      return 'Respond in English unless the user writes in another language.';
  }
}

/** Converts the user's saved preferences into a system prompt snippet. */
function profilePreferencesInstruction(profile: Profile): string {
  const p = profile.preferences;
  if (!p) return '';

  const style =
    p.responseStyle === 'concise'
      ? 'Keep answers short and to the point.'
      : p.responseStyle === 'detailed'
      ? 'Give thorough, well-explained answers with examples.'
      : 'Balance brevity with clarity.';

  const tone =
    p.tone === 'professional'
      ? 'Use a professional, neutral tone.'
      : p.tone === 'casual'
      ? 'Use a casual, relaxed tone.'
      : 'Use a warm, friendly tone.';

  const expertise =
    p.expertise === 'beginner'
      ? 'Assume the user is new to these topics — avoid jargon and explain simply.'
      : p.expertise === 'expert'
      ? 'The user is experienced — be technical and skip the basics.'
      : '';

  const parts = [style, tone];
  if (expertise) parts.push(expertise);
  return `User preferences: ${parts.join(' ')}`;
}

/**
 * Trims the message history to fit within the model's context window.
 * Always keeps the most recent user message, even if it exceeds the budget.
 */
function trimHistoryToBudget(args: {
  history: Pick<Message, 'role' | 'content'>[];
  system: string;
  contextSize: number;
  reserveForOutput: number;
}): ChatMsg[] {
  const { history, system, contextSize, reserveForOutput } = args;

  const systemTokens = estimateTokens(system);
  const rawBudget =
    contextSize - reserveForOutput - systemTokens - SAFETY_MARGIN_TOKENS;
  const budget = Math.max(MIN_BUDGET, rawBudget);

  const kept: ChatMsg[] = [];
  let used = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (!m?.content?.trim()) continue;

    const tokens = estimateTokens(m.content) + 8;
    const isMostRecentUser = i === history.length - 1 && m.role === 'user';

    if (used + tokens > budget && kept.length > 0 && !isMostRecentUser) break;

    kept.unshift({
      role: m.role === 'system' ? 'user' : m.role,
      content: m.content,
    });
    used += tokens;
  }

  return kept;
}

/** Turns a raw engine error into a user-friendly message. */
function friendlyError(e: unknown): string {
  if (!e) return 'Unknown error.';
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();

  if (lower.includes('memory') || lower.includes('oom') || lower.includes('alloc')) {
    return 'The model ran out of memory. Try a smaller model or reduce context in Settings.';
  }
  if (lower.includes('context') || lower.includes('too long')) {
    return 'The conversation got too long for the model. Start a new chat or reduce context in Settings.';
  }
  if (lower.includes('not loaded') || lower.includes('no model')) {
    return 'No model is loaded. Open the Models tab and activate one.';
  }
  if (lower.includes('corrupt')) {
    return 'The model file looks corrupted. Re-download it from the Models tab.';
  }
  return msg.length > 220 ? msg.slice(0, 220) + '…' : msg;
}