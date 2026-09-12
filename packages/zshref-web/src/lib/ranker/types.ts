// JSON shapes the browser loads. The index shapes are emitted by zshref-rs
// (consumed read-only here; the Rust SoT is `RecordText`, `IndexedRecord`,
// `VectorIndex` in `zshref-rs/src/nlp/{retrieval_text,index}.rs`); the rule
// shapes below are this package's own. zod schemas validate at load time;
// types derive from them so drift = type error.

import { z } from 'zod';

export const RecordTextSchema = z.object({
  category: z.string(),
  category_label: z.string(),
  id: z.string(),
  display: z.string(),
  sub_kind: z.string().optional(),
  title: z.string(),
  md_body: z.string(),
  structured: z.string(),
  body: z.string(),
  expanded: z.string()
});
export type RecordText = z.infer<typeof RecordTextSchema>;

// Float32Array transform: vectors round-trip through f32 precision (the
// source values were f32 in Rust). Ranker math reads them as ArrayLike,
// so Float32Array indexing returns the same JS-number representation as
// the original f32.
const F32Vec = z.array(z.number()).transform((arr) => new Float32Array(arr));

export const ViewVectorsSchema = z.object({
  structured: F32Vec,
  body: F32Vec,
  expanded: F32Vec
});
export type ViewVectors = z.infer<typeof ViewVectorsSchema>;

export const IndexedRecordSchema = z.object({
  text: RecordTextSchema,
  vectors: ViewVectorsSchema
});
export type IndexedRecord = z.infer<typeof IndexedRecordSchema>;

export const VectorIndexSchema = z.object({
  version: z.number().int(),
  model: z.string(),
  dims: z.number().int(),
  normalized: z.boolean(),
  corpus_hash: z.string(),
  records: z.array(IndexedRecordSchema)
});
export type VectorIndex = z.infer<typeof VectorIndexSchema>;

// Rule shapes — the source of truth for the rule YAML files (tuning,
// stopwords, synonyms). The Node side (nlp/rules-load.ts) validates the YAML
// with them, normalizes, and emits the JSON the browser loads through the
// same shapes; the editor schemas under rules/schema/ are generated from them
// (nlp/rules-schema.ts). Strict: an unknown key is an error. Field order =
// emitted key order. Mirrors zshref-rs/src/nlp/rules.rs until the Rust nlp
// module goes.

const f = Math.fround;
const f32 = z.number();
const usize = z.number().int().nonnegative();

/** Ceiling on any single effective boost/penalty, in semantic-cosine units.
 * Half the cosine range: a heavier term would dominate the semantic signal. */
export const MAX_SCORE_TERM = 0.5;

const TuningShape = z.strictObject({
  semantic_weights: z.strictObject({
    body: f32.describe(
      'Mix over the embedding views. Only body and structured are stored; expanded is derived as 1 − body − structured (on the simplex by construction).'
    ),
    structured: f32,
    short_body: z
      .strictObject({
        strength: f32.describe('Max shift, at body length 0.'),
        length_scale: f32.describe('Body length at/above which the shift is zero.')
      })
      .describe(
        'Sparse-body deformation: shifts mass body → expanded as a body shortens, so short records lean on structured/expanded text.'
      )
  }),
  boosts: z.strictObject({
    category: f32.describe("Weakest signal: the query names the record's category."),
    exact_word_increment: f32.describe(
      'Non-negative increment for a query word equal to id/display (exact_word = category + this).'
    ),
    resolver_increment: f32.describe(
      'Non-negative increment for a corpus-aware resolver hit (resolver = exact_word + this); the increments keep category ≤ exact_word ≤ resolver by construction.'
    ),
    word_overlap: z
      .strictObject({ scale: f32, half_sat: f32 })
      .describe('Smooth saturating overlap boost: asymptote `scale`, half of it at `half_sat`.')
  }),
  penalties: z.strictObject({ category_rarity_max: f32 }),
  lexical: z.strictObject({
    min_discriminating_word_len: usize,
    min_significant_word_len: usize
  })
});
export type Tuning = z.infer<typeof TuningShape>;

/** Effective exact-word and resolver boosts, chained from `category` by the
 * increments; f32, as the ranker applies them. */
export function derivedBoosts(b: Tuning['boosts']): { exactWord: number; resolver: number } {
  const exactWord = f(f(b.category) + f(b.exact_word_increment));
  return { exactWord, resolver: f(exactWord + f(b.resolver_increment)) };
}

interface Violation {
  path: (string | number)[];
  message: string;
}

// Range checks in the Rust order; the first violation is the error, as
// `parse_tuning` reports it. Values compare as f32, as they are stored there.
function tuningViolation(t: Tuning): Violation | null {
  const sw = t.semantic_weights;
  const b = t.boosts;
  if (sw.body < 0 || sw.structured < 0) {
    return { path: ['semantic_weights'], message: 'body/structured must be non-negative' };
  }
  if (f(f(sw.body) + f(sw.structured)) > f(1 + 1e-4)) {
    return {
      path: ['semantic_weights'],
      message: 'body + structured must be ≤ 1 (expanded is derived as 1 − body − structured)'
    };
  }
  if (sw.short_body.strength < 0) {
    return { path: ['semantic_weights', 'short_body', 'strength'], message: 'must be non-negative' };
  }
  if (sw.short_body.length_scale <= 0) {
    return { path: ['semantic_weights', 'short_body', 'length_scale'], message: 'must be positive' };
  }
  if (b.category < 0 || b.word_overlap.scale < 0) {
    return { path: ['boosts'], message: 'category/word_overlap.scale must be non-negative' };
  }
  if (b.exact_word_increment < 0 || b.resolver_increment < 0) {
    return {
      path: ['boosts'],
      message:
        'exact_word_increment/resolver_increment must be non-negative (preserves category ≤ exact_word ≤ resolver)'
    };
  }
  if (b.word_overlap.half_sat <= 0) {
    return { path: ['boosts', 'word_overlap', 'half_sat'], message: 'must be positive' };
  }
  // Bound the *effective* terms (what lands on a record's score), not the
  // stored increments — so the chained exact_word/resolver values are checked.
  const eff = derivedBoosts(b);
  const bounded: [string, Violation['path'], number][] = [
    ['boosts.category', ['boosts', 'category'], b.category],
    ['boosts effective exact_word', ['boosts'], eff.exactWord],
    ['boosts effective resolver', ['boosts'], eff.resolver],
    ['boosts.word_overlap.scale', ['boosts', 'word_overlap', 'scale'], b.word_overlap.scale],
    [
      'penalties.category_rarity_max',
      ['penalties', 'category_rarity_max'],
      t.penalties.category_rarity_max
    ]
  ];
  for (const [name, path, value] of bounded) {
    if (f(value) > MAX_SCORE_TERM) {
      return {
        path,
        message: `${name}: ${value} exceeds MAX_SCORE_TERM ${MAX_SCORE_TERM} (a term that large would swamp the semantic signal)`
      };
    }
  }
  return null;
}

export const TuningSchema = TuningShape.check((ctx) => {
  const v = tuningViolation(ctx.value);
  if (v) ctx.issues.push({ code: 'custom', input: ctx.value, path: v.path, message: v.message });
}).meta({
  title: 'Tuning',
  description: 'Rank-time scalar constants for the ranker (no re-embed on change).'
});

export const StopwordsSchema = z
  .strictObject({
    generic: z.array(z.string()).describe('Filtered from any tokenization of the query.'),
    discriminating_extra: z
      .array(z.string())
      .describe(
        'Filtered additionally when deciding whether a query word is distinctive enough to qualify a record for the exact-word boost.'
      )
  })
  .meta({ title: 'Stopwords', description: 'Query stopwords; rank-time.' });
export type Stopwords = z.infer<typeof StopwordsSchema>;

// Authors write triggers and canonical terms in natural casing (`PID`,
// `process ID`) or as phrases; the matchers compare against a lowercased
// haystack, so each term is trimmed and lowercased once at load rather than
// constraining the author. ASCII lowercasing, as the Rust side does.
const asciiLower = (s: string): string => s.replace(/[A-Z]+/g, (m) => m.toLowerCase());
const term = z
  .string()
  .overwrite((s) => asciiLower(s.trim()))
  .check((ctx) => {
    if (ctx.value === '') {
      ctx.issues.push({ code: 'custom', input: ctx.value, message: 'value must not be empty' });
    }
  });

export const QueryExpansionSchema = z
  .strictObject({
    when: z
      .array(term)
      .min(1, '`when` needs at least 1 trigger')
      .describe(
        'Colloquial trigger words / phrases (matched whole word / phrase). Any casing; normalized to lowercase at load.'
      ),
    add: term.describe(
      'Canonical term appended for embedding. One term by design; any casing, normalized to lowercase at load.'
    )
  })
  .describe(
    'One directional query rule: when any `when` trigger matches the query, the single canonical `add` term is appended to the embedded query string only (never the lexical-overlap bag — keeps short queries from being swamped).'
  );
export type QueryExpansion = z.infer<typeof QueryExpansionSchema>;

export const SynonymsSchema = z
  .strictObject({
    index_groups: z
      .array(z.array(term).min(2, 'a group needs at least 2 members'))
      .default([])
      .describe(
        'Symmetric, index-time. If any member matches a record (whole word / phrase), the others are appended to its expanded view before embedding. May be empty.'
      ),
    query_expansions: z
      .array(QueryExpansionSchema)
      .default([])
      .describe(
        "Directional, query-time, embedding-only. Maps colloquial query vocabulary onto the corpus's canonical term."
      )
  })
  .meta({
    title: 'Synonyms',
    description:
      'Generic zsh/English synonym data. Two disjoint mechanisms — see synonyms.yaml for the contract.'
  });
export type Synonyms = z.infer<typeof SynonymsSchema>;

// Result types — produced by the ranker, not loaded from JSON.

export interface SemanticScores {
  structured: number;
  body: number;
  expanded: number;
}

export interface Boosts {
  category: number;
  resolver: number;
  lexical: number;
}

export interface RankDebug {
  semantic: SemanticScores;
  boosts: Boosts;
}

export interface RankedMatch {
  rec: RecordText;
  score: number;
  debug: RankDebug;
}

export type ResolverHit = { category: string; id: string };
