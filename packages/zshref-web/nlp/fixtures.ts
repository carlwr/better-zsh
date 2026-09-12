// The two committed NLP fixtures: their shapes, generators, and the checks
// over them. `tests/nlp/fixtures.test.ts` drift-checks and (under
// `UPDATE_*_FIXTURE=1`) rewrites the files.
//
// - parity-fixture.json — a closed arithmetic contract: it ships the
//   miniature index it was ranked against alongside the pre-computed
//   `queryVec` + `resolverHit` per query, so `tests/parity.test.ts` checks
//   the ranker's f32 arithmetic against its own past with neither an
//   embedder nor the full index. Curated for branch coverage (resolver hit,
//   exact-word + category boost, short-body weighting, lexical overlap).
//
// - sanity-fixture.json — hand-curated "clear winner" queries through the
//   full pipeline (embedder + resolver hit + ranker); `sanityFailures`
//   enforces the invariants (top identity as curated, top score above the
//   floor, comfortable margin over the runner-up). Pins full-stack behaviour
//   at a coarser resolution than the parity fixture.
//
// Every number in either file is an f32 value, printed as its shortest
// decimal (`fixtureJson`); the schemas `Math.fround` on load so a parsed
// score is the f32 that was printed, not the double nearest its decimal.

import { readFile } from 'node:fs/promises';
import type { DocCorpus } from '@carlwr/zsh-core';
import type { DocCategory } from '@carlwr/zsh-core/taxonomy';
import { z } from 'zod';

import { loadVectorIndex } from '../src/lib/ranker/index-loader';
import { rank } from '../src/lib/ranker/rank';
import type { Rules } from '../src/lib/ranker/rules';
import type { RankedMatch, VectorIndex } from '../src/lib/ranker/types';
import { DIMS, type Embedder, embedQuery, normalizeF32 } from './embedder-node';
import { rustFixed } from './eval/format';
import { INDEX_VERSION, viewVectors } from './index-build';
import { f32Shortest } from './json-f32';
import { PATHS } from './paths';
import { resolverKey } from './resolver-key';
import { corpusTexts, type IndexGroups } from './retrieval-text';

// --- shapes ---------------------------------------------------------------

const f32 = z.number().transform(Math.fround);
const f32Vec = z.array(z.number()).transform((a) => new Float32Array(a));

const IdentitySchema = z.object({ category: z.string(), id: z.string() });
const ScoredSchema = IdentitySchema.extend({ score: f32 });
export type Scored = z.infer<typeof ScoredSchema>;

export const PARITY_VERSION = 3;
export const PARITY_LIMIT = 5;

export const ParityFixtureSchema = z.object({
  version: z.literal(PARITY_VERSION),
  limit: z.number().int(),
  // Through the production loader, not just its schema: whatever validation
  // a staged index gets, the fixture's embedded one gets too.
  index: z.unknown().transform(loadVectorIndex),
  entries: z.array(
    z.object({
      query: z.string(),
      queryVec: f32Vec,
      resolverHit: IdentitySchema.optional(),
      expected: z.array(ScoredSchema)
    })
  )
});
export type ParityFixture = z.infer<typeof ParityFixtureSchema>;

export const SANITY_VERSION = 1;
export const SANITY_FLOOR = Math.fround(0.7);
export const SANITY_MARGIN = Math.fround(0.03);

export const SanityFixtureSchema = z.object({
  version: z.literal(SANITY_VERSION),
  invariants: z.object({ absoluteFloor: f32, minMargin: f32 }),
  entries: z.array(
    z.object({
      query: z.string(),
      topMatch: ScoredSchema,
      runnerUp: ScoredSchema.optional()
    })
  )
});
export type SanityFixture = z.infer<typeof SanityFixtureSchema>;
export type SanityEntry = SanityFixture['entries'][number];

export async function loadParityFixture(path: string = PATHS.parityFixture): Promise<ParityFixture> {
  return ParityFixtureSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

export async function loadSanityFixture(path: string = PATHS.sanityFixture): Promise<SanityFixture> {
  return SanityFixtureSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

// --- parity ----------------------------------------------------------------

type RecordRef = { category: DocCategory; id: string };

/**
 * Parity-fixture curation: branch coverage in the ranker. Order is
 * load-bearing — the fixture is positional. Queries are neutral
 * branch-exercisers, deliberately NOT drawn from any eval set (see NLP.md):
 * the fixture only snapshots ranker math, never a "correct answer", so no
 * holdout query belongs here.
 */
export const PARITY_QUERIES: readonly string[] = [
  // resolver-hit branch — the option resolver normalizes "AUTO_CD" → (option, autocd).
  'AUTO_CD',
  // exact-word (id) match + category-name boost.
  'setopt builtin',
  // multi-word lexical overlap, no exact id match.
  'redirect output to a file',
  // short query — exercises short-body weighting in the top results.
  'glob qualifier flags',
  // symbolic surface match — an operator token against a record's display
  // head, the branch `significantWords` deliberately drops.
  '>> file'
];

/**
 * Corpus records the fixture's miniature index is built from. Real records,
 * so resolver hits and lexical overlap stay meaningful; curated for the
 * branches `PARITY_QUERIES` aims at. Category sizes are deliberately
 * unequal, which pins the rarity penalty the moment its weight stops being
 * zero. Order is load-bearing — the fixture is positional.
 */
export const PARITY_INDEX_RECORDS: readonly RecordRef[] = [
  // resolver-hit target of the "AUTO_CD" query; two more keep this the
  // largest category, i.e. the rarity baseline.
  { category: 'option', id: 'autocd' },
  { category: 'option', id: 'extendedglob' },
  { category: 'option', id: 'globdots' },
  // exact-word id match + category-name boost.
  { category: 'builtin', id: 'setopt' },
  { category: 'builtin', id: 'unsetopt' },
  // multi-word lexical overlap, no exact id match.
  { category: 'redirection', id: '>_word' },
  { category: 'redirection', id: '>>_word' },
  // short vs. long body inside one category — both ends of the short-body
  // weight ramp.
  { category: 'glob_qualifier', id: '.' },
  { category: 'glob_qualifier', id: 'f' }
];

/**
 * Provenance of the fixture's index, in place of a model id and a corpus
 * hash: its vectors are generated rather than embedded, and neither field
 * would be true.
 */
export const PARITY_INDEX_TAG = 'synthetic:parity-fixture';

const MASK64 = (1n << 64n) - 1n;

/** FNV-1a over each part's UTF-8 bytes; a trailing 0xff separates the parts,
 * so ("ab", "c") and ("a", "bc") do not collide. */
function fnv1a(parts: readonly string[]): bigint {
  let h = 0xcbf29ce484222325n;
  for (const p of parts) {
    for (const b of [...new TextEncoder().encode(p), 0xff]) {
      h ^= BigInt(b);
      h = (h * 0x100000001b3n) & MASK64;
    }
  }
  return h;
}

/**
 * Stand-in for an embedding: a fixed-seed stream keyed by the vector's
 * identity (splitmix64 seeded by `fnv1a(key) | 1`, u64 wrapping via 64-bit
 * masking), normalized like a real one. Parity asserts that the ranker's
 * arithmetic agrees with its own past, never that retrieval is good — so
 * the numbers need to be reproducible, not meaningful, and generating them
 * is what keeps the 127M model out of the contract.
 */
export function syntheticVec(key: readonly string[]): Float32Array<ArrayBuffer> {
  let state = fnv1a(key) | 1n;
  const v = new Float32Array(DIMS);
  for (let i = 0; i < DIMS; i++) {
    state = (state + 0x9e3779b97f4a7c15n) & MASK64;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    z ^= z >> 31n;
    // Top 24 bits over 2^23: every step is exact in f32, so the spread over
    // [-1, 1) carries no rounding bias (the typed-array store is the f32 cast).
    v[i] = Number(z >> 40n) / 8388608 - 1;
  }
  normalizeF32(v);
  return v;
}

/** The miniature index: the curated records' real retrieval text, synthetic vectors. */
export function buildParityIndex(corpus: DocCorpus, indexGroups: IndexGroups): VectorIndex {
  const texts = corpusTexts(corpus, indexGroups);
  const records = PARITY_INDEX_RECORDS.map(({ category, id }) => {
    const text = texts.find((t) => t.category === category && t.id === id);
    if (!text) throw new Error(`parity index record ${category}/${id} is not in the corpus`);
    return { text, vectors: viewVectors((view) => syntheticVec([category, id, view])) };
  });
  return {
    version: INDEX_VERSION,
    model: PARITY_INDEX_TAG,
    dims: DIMS,
    normalized: true,
    corpus_hash: PARITY_INDEX_TAG,
    records
  };
}

const scored = (m: RankedMatch): Scored => ({ category: m.rec.category, id: m.rec.id, score: m.score });

/** Per query: synthetic query vector, the resolver's hit over the full
 * corpus, the top `PARITY_LIMIT` of the ranker over the mini index. No
 * lookup-map promote — this pins ranker math alone. */
export function buildParityFixture(corpus: DocCorpus, rules: Rules): ParityFixture {
  const index = buildParityIndex(corpus, rules.synonyms.index_groups);
  const entries = PARITY_QUERIES.map((query) => {
    const queryVec = syntheticVec(['query', query]);
    const resolverHit = resolverKey(corpus, query);
    const ranked = rank(query, queryVec, resolverHit, null, index, rules);
    return {
      query,
      queryVec,
      ...(resolverHit ? { resolverHit } : {}),
      expected: ranked.slice(0, PARITY_LIMIT).map(scored)
    };
  });
  return { version: PARITY_VERSION, limit: PARITY_LIMIT, index, entries };
}

// --- sanity ----------------------------------------------------------------

export type SanityQuery = RecordRef & { query: string };

/**
 * Sanity-fixture curation: queries that fire exact-word + category boosts on
 * a rare record name → predictable top-1 with comfortable margin. If a query
 * fails the invariants after a deliberate ranker change, re-curate (drop or
 * replace the query) rather than relaxing them.
 */
export const SANITY_QUERIES: readonly SanityQuery[] = [
  { query: 'kshoptionprint option', category: 'option', id: 'kshoptionprint' },
  { query: 'autopushd option', category: 'option', id: 'autopushd' },
  { query: 'zmodload builtin', category: 'builtin', id: 'zmodload' },
  { query: 'rcexpandparam option', category: 'option', id: 'rcexpandparam' },
  { query: 'promptbang option', category: 'option', id: 'promptbang' }
];

export interface SanityInputs {
  corpus: DocCorpus;
  index: VectorIndex;
  rules: Rules;
  embedder: Embedder;
}

/**
 * The full pipeline per curated query — embed (expansion + `query:` prefix
 * + normalize), resolver hit over the corpus, rank with no category and no
 * promote — keeping its top-1 and runner-up.
 */
export async function buildSanityFixture({ corpus, index, rules, embedder }: SanityInputs): Promise<SanityFixture> {
  const entries: SanityEntry[] = [];
  for (const { query } of SANITY_QUERIES) {
    const queryVec = await embedQuery(embedder, query, rules);
    const [top, runner] = rank(query, queryVec, resolverKey(corpus, query), null, index, rules);
    if (!top) throw new Error(`no matches for sanity query ${JSON.stringify(query)}`);
    entries.push({ query, topMatch: scored(top), ...(runner ? { runnerUp: scored(runner) } : {}) });
  }
  return {
    version: SANITY_VERSION,
    invariants: { absoluteFloor: SANITY_FLOOR, minMargin: SANITY_MARGIN },
    entries
  };
}

/** f32, as the fixture stores scores. */
const margin = (top: Scored, runner: Scored): number => Math.fround(top.score - runner.score);

/** One message per violated invariant (identity drift / floor / margin). */
function entryFailures(e: SanityEntry): string[] {
  const out: string[] = [];
  const label = `sanity query ${JSON.stringify(e.query)}`;
  const top = e.topMatch;
  const want = SANITY_QUERIES.find((q) => q.query === e.query);
  if (!want) {
    out.push(`${label}: not a curated sanity query`);
  } else if (top.category !== want.category || top.id !== want.id) {
    out.push(
      `${label}: top identity drifted from curated expected_top (got ${top.category}/${top.id}, want ${want.category}/${want.id})`
    );
  }
  if (top.score < SANITY_FLOOR) {
    out.push(`${label}: top score ${f32Shortest(top.score)} below absoluteFloor ${f32Shortest(SANITY_FLOOR)}`);
  }
  if (e.runnerUp) {
    const m = margin(top, e.runnerUp);
    if (m < SANITY_MARGIN) {
      out.push(
        `${label}: margin ${f32Shortest(m)} below minMargin ${f32Shortest(SANITY_MARGIN)} (top ${f32Shortest(top.score)}, runnerUp ${f32Shortest(e.runnerUp.score)})`
      );
    }
  }
  return out;
}

/** Every violated invariant over the fixture's entries; empty ⇒ all hold. */
export function sanityFailures(fixture: SanityFixture): string[] {
  return fixture.entries.flatMap(entryFailures);
}

/** The dashboard's sanity block: queries holding, worst floor and margin, then the failures indented. */
export function renderSanity(fixture: SanityFixture): string {
  const entries = fixture.entries;
  const fails = sanityFailures(fixture);
  const ok = entries.filter((e) => entryFailures(e).length === 0).length;
  const worst = (xs: number[]): string => rustFixed(Math.min(...xs), 3);
  const worstFloor = worst(entries.map((e) => e.topMatch.score));
  const worstMargin = worst(entries.flatMap((e) => (e.runnerUp ? [margin(e.topMatch, e.runnerUp)] : [])));
  const detail = fails.length === 0 ? '' : `\n  ${fails.join('\n  ')}`;
  return `[sanity] ${ok}/${entries.length} hold  floor≥${f32Shortest(SANITY_FLOOR)} (worst ${worstFloor})  margin≥${f32Shortest(SANITY_MARGIN)} (worst ${worstMargin})${detail}\n`;
}

// --- JSON ------------------------------------------------------------------

/**
 * A fixture as committed: pretty (2-space, as `JSON.stringify` lays it out),
 * every number the shortest decimal for its f32 (a non-f32 number is a
 * generator bug and throws), vectors as plain arrays, `undefined` fields
 * omitted, trailing newline.
 */
export function fixtureJson(value: unknown): string {
  return `${pretty(value, '')}\n`;
}

function pretty(v: unknown, indent: string): string {
  if (typeof v === 'number') return f32Shortest(v);
  if (typeof v === 'string' || typeof v === 'boolean' || v === null) return JSON.stringify(v);
  const inner = `${indent}  `;
  if (Array.isArray(v) || v instanceof Float32Array) {
    const items = Array.from(v as ArrayLike<unknown>, (x) => `${inner}${pretty(x, inner)}`);
    return items.length === 0 ? '[]' : `[\n${items.join(',\n')}\n${indent}]`;
  }
  if (typeof v === 'object') {
    const fields = Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => `${inner}${JSON.stringify(k)}: ${pretty(x, inner)}`);
    return fields.length === 0 ? '{}' : `{\n${fields.join(',\n')}\n${indent}}`;
  }
  throw new Error(`fixtureJson: cannot serialize a ${typeof v}`);
}
