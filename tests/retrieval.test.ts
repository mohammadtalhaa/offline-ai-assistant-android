import { rank, tokenize, type Rankable } from '../src/features/retrieval/bm25';

/* ------------------------------- helpers ------------------------------- */

interface Doc extends Rankable {
  id: number;
  text: string;
}

const doc = (id: number, text: string): Doc => ({ id, text });

/** Extract just the ids from a rank() result, in order. */
const ids = <T extends Rankable>(r: { item: T }[]) => r.map((x) => x.item.id);

/** Standard corpus used across multiple tests. */
const CORPUS: Doc[] = [
  doc(1, 'The Indus river flows through Pakistan and empties into the Arabian Sea.'),
  doc(2, 'Neural networks learn representations from data using gradient descent.'),
  doc(3, 'Peshawar is the capital of Khyber Pakhtunkhwa province.'),
  doc(4, 'Karachi is the largest city in Pakistan by population.'),
  doc(5, 'The river Indus has five major tributaries in Punjab.'),
];

/* ------------------------------ tokenize ------------------------------- */

describe('tokenize', () => {
  it('lowercases everything', () => {
    expect(tokenize('HELLO World')).toEqual(['hello', 'world']);
  });

  it('strips common English stop words', () => {
    expect(tokenize('the quick brown fox')).toEqual(['quick', 'brown', 'fox']);
  });

  it('drops single-character tokens', () => {
    // 'a' is both a stop word and length 1; 'x' is only length 1.
    expect(tokenize('a x hello')).toEqual(['hello']);
  });

  it('splits on common ASCII punctuation', () => {
    expect(tokenize('hello, world! foo? bar. baz;')).toEqual(['hello', 'world', 'foo', 'bar', 'baz']);
  });

  it('splits on Urdu punctuation (، ۔ ؟)', () => {
    expect(tokenize('پاکستان، پشاور۔')).toEqual(['پاکستان', 'پشاور']);
  });

  it('splits on brackets, quotes, and slashes', () => {
    expect(tokenize('foo(bar) [baz] "qux"/quux')).toEqual(['foo', 'bar', 'baz', 'qux', 'quux']);
  });

  it('handles Roman Urdu without stemming', () => {
    expect(tokenize('Aap kaise hain? Main theek hoon.')).toEqual([
      'aap',
      'kaise',
      'hain',
      'main',
      'theek',
      'hoon',
    ]);
  });

  it('returns [] for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('returns [] for whitespace only', () => {
    expect(tokenize('   \t\n  ')).toEqual([]);
  });

  it('returns [] for pure punctuation', () => {
    expect(tokenize('.,;:!?()[]{}')).toEqual([]);
  });

  it('returns [] for pure stop words', () => {
    expect(tokenize('the a an and or')).toEqual([]);
  });

  it('preserves non-ASCII letters', () => {
    expect(tokenize('café résumé')).toEqual(['café', 'résumé']);
  });
});

/* -------------------------------- rank --------------------------------- */

describe('rank — basic behavior', () => {
  it('ranks the most relevant chunk first', () => {
    const r = rank('Indus river', CORPUS);
    // Both 1 and 5 mention "river" + "Indus"; both should outrank 2, 3, 4.
    expect(r.length).toBeGreaterThan(0);
    expect([1, 5]).toContain(r[0].item.id);
  });

  it('returns [] for an empty query', () => {
    expect(rank('', CORPUS)).toEqual([]);
  });

  it('returns [] for a whitespace-only query', () => {
    expect(rank('   ', CORPUS)).toEqual([]);
  });

  it('returns [] when items list is empty', () => {
    expect(rank('anything', [])).toEqual([]);
  });

  it('returns [] for a pure stop-word query', () => {
    expect(rank('the a an and or', CORPUS)).toEqual([]);
  });

  it('returns [] when no term matches', () => {
    expect(rank('zzzzq', CORPUS)).toEqual([]);
  });

  it('returns [] when only the single-char query is given', () => {
    // Length filter drops 1-char tokens.
    expect(rank('a', CORPUS)).toEqual([]);
  });
});

describe('rank — ordering and relevance', () => {
  it('ranks documents by number of matching terms', () => {
    const r = rank('river Indus tributaries', CORPUS);
    // Doc 5 has all three terms; doc 1 has two; others have none.
    expect(r[0].item.id).toBe(5);
  });

  it('prefers shorter documents when matched terms repeat', () => {
    // Short doc and long doc both contain "kubernetes"; BM25 favors short.
    const short = doc(1, 'kubernetes');
    const long = doc(2, 'kubernetes is a container orchestration platform that ' +
      'automates deployment scaling and management of containerized applications across clusters');
    const r = rank('kubernetes', [short, long]);
    expect(r[0].item.id).toBe(1);
  });

  it('prefers documents with more term occurrences (up to BM25 saturation)', () => {
    const once = doc(1, 'apple banana cherry date elderberry fig grape');
    const thrice = doc(2, 'apple apple apple banana cherry date elderberry');
    const r = rank('apple', [once, thrice]);
    expect(r[0].item.id).toBe(2);
  });

  it('ranks rare terms higher than common terms (IDF)', () => {
    const corpus: Doc[] = [
      doc(1, 'common rare'),
      doc(2, 'common'),
      doc(3, 'common'),
      doc(4, 'common'),
      doc(5, 'common'),
    ];
    // Doc 1 contains both. Querying for the rare word should rank doc 1
    // higher than querying for the common word.
    const rareScore = rank('rare', corpus)[0].score;
    const commonScore = rank('common', corpus)[0].score;
    expect(rareScore).toBeGreaterThan(commonScore);
  });

  it('respects the k limit', () => {
    const r = rank('common', [
      doc(1, 'common alpha'),
      doc(2, 'common beta'),
      doc(3, 'common gamma'),
      doc(4, 'common delta'),
      doc(5, 'common epsilon'),
    ], 3);
    expect(r.length).toBe(3);
  });

  it('returns fewer than k when fewer matches exist', () => {
    const r = rank('common', [doc(1, 'common'), doc(2, 'unrelated')], 10);
    expect(r.length).toBe(1);
  });
});

describe('rank — case and punctuation invariance', () => {
  it('treats different cases as the same term', () => {
    const a = ids(rank('indus', CORPUS));
    const b = ids(rank('INDUS', CORPUS));
    const c = ids(rank('InDuS', CORPUS));
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('treats trailing punctuation as a token boundary', () => {
    const a = ids(rank('river', CORPUS));
    const b = ids(rank('river!', CORPUS));
    const c = ids(rank('river,', CORPUS));
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('handles multi-word queries with punctuation', () => {
    const r = rank('Indus, river!', CORPUS);
    expect(r.length).toBeGreaterThan(0);
    expect([1, 5]).toContain(r[0].item.id);
  });
});

describe('rank — multilingual', () => {
  const MIXED: Doc[] = [
    doc(1, 'پاکستان ایک خوبصورت ملک ہے۔'),
    doc(2, 'Aap kaise hain? Main theek hoon aur aap?'),
    doc(3, 'Neural networks are used in machine learning.'),
  ];

  it('ranks Urdu queries correctly', () => {
    const r = rank('پاکستان', MIXED);
    expect(r.length).toBe(1);
    expect(r[0].item.id).toBe(1);
  });

  it('ranks Roman Urdu queries correctly', () => {
    const r = rank('theek hoon', MIXED);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].item.id).toBe(2);
  });

  it('does not conflate Urdu and English corpora', () => {
    expect(rank('neural', MIXED).map((x) => x.item.id)).toEqual([3]);
    expect(rank('پاکستان', MIXED).map((x) => x.item.id)).toEqual([1]);
  });
});

describe('rank — behavioral guarantees', () => {
  it('is deterministic for identical inputs', () => {
    const a = rank('river Pakistan', CORPUS);
    const b = rank('river Pakistan', CORPUS);
    expect(ids(a)).toEqual(ids(b));
  });

  it('returns items in non-increasing score order', () => {
    const r = rank('river Pakistan Indus', CORPUS);
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
    }
  });

  it('never returns items with score 0', () => {
    const r = rank('river', CORPUS);
    r.forEach((x) => expect(x.score).toBeGreaterThan(0));
  });

  it('returns the original item references, not clones', () => {
    const r = rank('river Indus', CORPUS);
    const ref = r[0].item;
    expect(CORPUS.includes(ref)).toBe(true);
  });

  it('handles a large corpus without crashing', () => {
    const big: Doc[] = Array.from({ length: 500 }, (_, i) =>
      doc(i, i % 7 === 0 ? `alpha beta gamma item ${i}` : `filler word content number ${i}`),
    );
    const r = rank('alpha beta gamma', big, 10);
    expect(r.length).toBe(10);
    // Every top result should be one of the matching docs.
    r.forEach((x) => expect(x.item.id % 7).toBe(0));
  });

  it('handles very long documents', () => {
    const long = doc(1, 'alpha ' + 'filler '.repeat(2000) + ' omega');
    const short = doc(2, 'alpha omega');
    const r = rank('alpha omega', [long, short]);
    // Short doc should win because of BM25 length normalization.
    expect(r[0].item.id).toBe(2);
  });
});