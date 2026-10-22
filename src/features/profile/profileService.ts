import { getEngine, type ChatMsg } from '../inference';
import {
  listConversations,
  listMemories,
  listMessages,
} from '../../services/database/db';

/* ------------------------------ constants ------------------------------ */

const GENERATION_TIMEOUT_MS = 60_000;
const MAX_SNIPPET_CHARS = 140;
const MAX_SNIPPETS = 18;
const MAX_MEMORY_FACTS = 20;
const MAX_CONVERSATIONS_TO_SCAN = 8;
const MAX_OUTPUT_CHARS = 700;
const MIN_OUTPUT_CHARS = 60;

/* -------------------------------- types -------------------------------- */

export interface BioInput {
  name: string;
  occupation?: string;
  location?: string;
}

export interface BioOptions {
  /** Optional abort signal — cancels generation and returns early. */
  signal?: AbortSignal;
  /** Override the default timeout (ms). */
  timeoutMs?: number;
}

/* ------------------------------ service -------------------------------- */

/**
 * Builds a profile bio from the user's memories and recent conversations.
 * Returns a 2–3 sentence third-person description.
 *
 * Never throws a raw native error — always a friendly message.
 * Honours an AbortSignal for cancellation.
 */
export async function generateBio(
  input: string | BioInput,
  occupation?: string,
  location?: string,
  options?: BioOptions,
): Promise<string> {
  // Support both call signatures: generateBio(name, occ, loc) and generateBio({name, occ, loc})
  const args: BioInput =
    typeof input === 'string'
      ? { name: input, occupation, location }
      : input;

  const opts = options ?? {};
  const timeoutMs = opts.timeoutMs ?? GENERATION_TIMEOUT_MS;

  /* -------------------- pre-flight validation -------------------- */

  const engine = getEngine();
  if (!engine.requiresModel) {
    throw new Error(
      'This build uses the demo engine, which cannot write a real profile. Install a model from the Models tab.',
    );
  }
  if (!engine.isLoaded()) {
    throw new Error(
      'No model is loaded yet. Open the Models tab, activate a model, then try again.',
    );
  }

  if (opts.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  /* -------------------- gather context (fast) -------------------- */

  const [memories, conversations] = await Promise.all([
    safe(() => listMemories(), []),
    safe(() => listConversations(), []),
  ]);

  // Load messages from the top conversations in parallel (with per-conv error isolation)
  const conversationsToScan = conversations.slice(0, MAX_CONVERSATIONS_TO_SCAN);
  const messageSets = await Promise.all(
    conversationsToScan.map((conv) =>
      safe(() => listMessages(conv.id), [] as Awaited<ReturnType<typeof listMessages>>),
    ),
  );

  /* ------------------- build context blocks ---------------------- */

  const snippets: string[] = [];
  for (const msgs of messageSets) {
    const userMsgs = msgs
      .filter((m) => m.role === 'user')
      .slice(0, 3);
    for (const m of userMsgs) {
      const clean = m.content
        .replace(/\s+/g, ' ')
        .replace(/^\/remember\s+/i, '')
        .trim()
        .slice(0, MAX_SNIPPET_CHARS);
      // Skip slash commands and one-liners with no signal
      if (clean && clean.length > 15) snippets.push(clean);
      if (snippets.length >= MAX_SNIPPETS) break;
    }
    if (snippets.length >= MAX_SNIPPETS) break;
  }

  const factsBlock = memories.length
    ? memories
        .slice(0, MAX_MEMORY_FACTS)
        .map((m) => `- ${m.text.replace(/\s+/g, ' ').slice(0, 200)}`)
        .join('\n')
    : '(no saved facts)';

  const snippetsBlock = snippets.length
    ? snippets.map((s) => `- ${s}`).join('\n')
    : '(no conversation yet)';

  const hasAnySignal = memories.length > 0 || snippets.length > 0;

  /* ------------------------- system prompt ------------------------ */

  const system =
    'You write short, elegant third-person profiles of a person based on their notes and messages. ' +
    'RULES:\n' +
    '• Exactly 2 sentences. Never more.\n' +
    '• Third person only — use "they", never "you" or "I".\n' +
    '• Warm, understated, human. No flattery, no clichés, no therapy-speak.\n' +
    '• No bullet points, no emojis, no quotation marks around the whole thing.\n' +
    '• Do NOT begin with the person\'s name.\n' +
    '• Do NOT reference the data ("based on", "their messages show", "the assistant", "the user").\n' +
    '• Describe who they are and how they think — not what they asked.\n' +
    '• If the data is sparse, err on the side of quiet observation rather than invention.\n' +
    '• Output ONLY the two sentences. No preamble, no explanation, no closing remarks.';

  const identity: string[] = [];
  identity.push(`Name: ${(args.name || '').trim() || 'Anonymous'}`);
  if (args.occupation?.trim()) identity.push(`Occupation: ${args.occupation.trim()}`);
  if (args.location?.trim()) identity.push(`Location: ${args.location.trim()}`);

  const userPrompt =
    `${identity.join('\n')}\n\n` +
    `Facts they asked to be remembered:\n${factsBlock}\n\n` +
    `Things they said recently:\n${snippetsBlock}\n\n` +
    (hasAnySignal
      ? 'Write the 2-sentence profile now.'
      : 'The person has not used the assistant much yet. Write a short, gentle, forward-looking 2-sentence profile. Do not invent specific hobbies or facts.');

  const messages: ChatMsg[] = [
    { role: 'system', content: system },
    { role: 'user', content: userPrompt },
  ];

  /* ----------------------- generate with timeout ------------------ */

  const rawText = await withTimeout(
    engine.generate(messages, {
      maxTokens: 200,
      temperature: 0.65,
      onToken: () => {
        /* discard streaming — we only want the final text */
      },
    }),
    timeoutMs,
    opts.signal,
  );

  const text = sanitizeBio(rawText.text, args.name);

  if (!text) {
    throw new Error(
      'The model did not produce a usable description. Try again, or switch to a larger model for better quality.',
    );
  }
  return text;
}

/* ================================================================== *
 *  HELPERS
 * ================================================================== */

/** Run an async fn; return a fallback on any error. Never throws. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/** Race a promise against a timeout, optionally honouring an AbortSignal. */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            'Generation timed out. The model may be too large for this device — try a smaller one or shorter context.',
          ),
        ),
      );
    }, ms);

    const onAbort = () => {
      finish(() => reject(new DOMException('Aborted', 'AbortError')));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (v) => finish(() => resolve(v)),
      (e) => finish(() => reject(e)),
    );
  });
}

/**
 * Clean and validate the model's bio output.
 * Returns an empty string when the output is unusable.
 */
function sanitizeBio(raw: string | undefined | null, name: string): string {
  if (!raw) return '';

  let t = String(raw).trim();

  // Strip surrounding triple-backticks or block quotes
  t = t.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '');
  t = t.replace(/^[`>•\-–—\s]+/gm, '');

  // Strip outer quotes of any flavour
  t = t.replace(/^["'“”«»「」『』]+/, '').replace(/["'“”«»「」『』]+$/, '');

  // Strip common model preambles
  t = t
    .replace(/^(sure|of course|here(?:'s| is)|this is|i(?:'ve| have) writ(?:ten|e))\b[^a-z]*/i, '')
    .replace(/^the (?:profile|description) (?:is|would be)\b[^a-z]*/i, '')
    .trim();

  // Remove common assistant-speak
  t = t
    .replace(/\bas an ai\b[^.]*\./gi, '')
    .replace(/\bi (?:can(?:'t|not)|am unable to)\b[^.]*\./gi, '')
    .trim();

  // Collapse whitespace
  t = t.replace(/\s+/g, ' ').trim();

  // Reject obvious failures
  if (!t) return '';
  if (t.length < MIN_OUTPUT_CHARS) return '';
  if (/^\[?(?:error|failed|unknown)/i.test(t)) return '';

  // If the name appears at the very start, remove it
  const firstName = name.trim().split(/\s+/)[0];
  if (firstName && firstName.length > 2) {
    const escapeRe = new RegExp(
      `^${escapeRegExp(firstName)}[^a-z]*(?:is |was |has |tends )?`,
      'i',
    );
    t = t.replace(escapeRe, '').trim();
    // Capitalize the new first letter
    t = t.charAt(0).toUpperCase() + t.slice(1);
  }

  // Cap to a reasonable length without cutting mid-sentence
  if (t.length > MAX_OUTPUT_CHARS) {
    const cut = t.slice(0, MAX_OUTPUT_CHARS);
    const lastPeriod = cut.lastIndexOf('.');
    t = lastPeriod > MAX_OUTPUT_CHARS * 0.6
      ? cut.slice(0, lastPeriod + 1)
      : cut.trim() + '…';
  }

  return t;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}