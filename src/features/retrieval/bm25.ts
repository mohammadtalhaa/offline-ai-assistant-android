const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are', 'was', 'were', 'it', 'on', 'for',
  'with', 'as', 'by', 'at', 'be', 'this', 'that', 'from', 'what', 'which', 'how', 'who',
]);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[\s.,;:!?()[\]{}"'`،۔؟\-–—/\\|<>=+*&^%$#@~_]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export interface Rankable {
  id: number;
  text: string;
}

export interface Ranked<T extends Rankable> {
  item: T;
  score: number;
}

/** Okapi BM25 over in-memory chunks. Works offline with any language that uses spaces. */
export function rank<T extends Rankable>(query: string, items: T[], k = 4): Ranked<T>[] {
  const q = Array.from(new Set(tokenize(query)));
  if (!q.length || !items.length) return [];
  const docs = items.map((it) => {
    const toks = tokenize(it.text);
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { it, tf, len: toks.length };
  });
  const avg = docs.reduce((n, d) => n + d.len, 0) / docs.length || 1;
  const N = docs.length;
  const k1 = 1.5;
  const b = 0.75;
  const idf = new Map<string, number>();
  for (const t of q) {
    const df = docs.reduce((n, d) => n + (d.tf.has(t) ? 1 : 0), 0);
    idf.set(t, Math.log(1 + (N - df + 0.5) / (df + 0.5)));
  }
  const out: Ranked<T>[] = [];
  for (const d of docs) {
    let score = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      score += (idf.get(t) ?? 0) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avg)));
    }
    if (score > 0) out.push({ item: d.it, score });
  }
  return out.sort((a, b2) => b2.score - a.score).slice(0, k);
}