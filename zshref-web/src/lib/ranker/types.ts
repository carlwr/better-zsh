// JSON shapes for the data emitted by zshref-rs (consumed read-only here).
// The Rust SoT is `RecordText`, `IndexedRecord`, `VectorIndex` in
// `zshref-rs/src/nlp/{retrieval_text,index}.rs`. zod schemas validate at
// load time; types below derive from them so drift = type error.

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

// Tuning constants mirror `Tuning` in zshref-rs/src/nlp/rules.rs.
export const TuningSchema = z.object({
  semantic_weights: z.object({
    body: z.number(),
    structured: z.number(),
    short_body: z.object({
      strength: z.number(),
      length_scale: z.number()
    })
  }),
  boosts: z.object({
    category: z.number(),
    exact_word_increment: z.number(),
    resolver_increment: z.number(),
    word_overlap: z.object({
      scale: z.number(),
      half_sat: z.number()
    })
  }),
  penalties: z.object({
    category_rarity_max: z.number()
  }),
  lexical: z.object({
    min_discriminating_word_len: z.number().int(),
    min_significant_word_len: z.number().int()
  })
});
export type Tuning = z.infer<typeof TuningSchema>;

export const StopwordsSchema = z.object({
  generic: z.array(z.string()),
  discriminating_extra: z.array(z.string())
});
export type Stopwords = z.infer<typeof StopwordsSchema>;

// Synonym data mirrors `Synonyms` / `QueryExpansion` in zshref-rs/src/nlp/rules.rs.
export const QueryExpansionSchema = z.object({
  when: z.array(z.string()),
  add: z.string()
});
export type QueryExpansion = z.infer<typeof QueryExpansionSchema>;

export const SynonymsSchema = z.object({
  index_groups: z.array(z.array(z.string())),
  query_expansions: z.array(QueryExpansionSchema)
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
