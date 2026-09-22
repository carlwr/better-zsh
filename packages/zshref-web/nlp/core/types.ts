// The NLP's shared shapes: the model identity, the index and categories
// JSON as zod schemas validated at load time — types derive from them so
// drift = type error — and the ranker's result types.

import { z } from "zod"

import { byteOrder } from "./text"

/** The one embedding model, whichever runtime embeds; and its vector width. */
export const MODEL_ID = "BAAI/bge-small-en-v1.5"
export const DIMS = 384

/** A record's identity: its category and its id within it. */
export const RecordIdSchema = z.object({ category: z.string(), id: z.string() })
export type RecordId = z.infer<typeof RecordIdSchema>

export const sameRecord = (a: RecordId, b: RecordId): boolean =>
  a.category === b.category && a.id === b.id

/** The identity as text, for keys and messages. */
export const recordKey = (r: RecordId): string => `${r.category}/${r.id}`

/** By category, then id. */
export const compareRecordIds = (a: RecordId, b: RecordId): number =>
  byteOrder(a.category, b.category) || byteOrder(a.id, b.id)

/**
 * A record over a closed key list, one value per key from `f`. The one
 * cast: `Object.fromEntries` cannot know the keys are exactly `keys`.
 */
export const recordOver = <K extends string, T>(
  keys: readonly K[],
  f: (key: K, at: number) => T,
): Record<K, T> =>
  Object.fromEntries(keys.map((key, at) => [key, f(key, at)])) as Record<K, T>

/**
 * The embedded views of a record, in the order their texts are embedded;
 * the canonical key source of every per-view shape.
 */
export const VIEWS = ["structured", "body", "expanded"] as const
export type View = (typeof VIEWS)[number]

/** One value per view, from `f`; the keys are exactly `VIEWS`. */
export const perView = <T>(f: (view: View, at: number) => T): Record<View, T> =>
  recordOver(VIEWS, f)

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
  expanded: z.string(),
})
export type RecordText = z.infer<typeof RecordTextSchema>

// Float32Array transform: vectors as JSON numbers, each the shortest
// decimal for its f32 (`json-f32.ts`). Ranker math reads them as
// ArrayLike, so Float32Array indexing returns the same JS-number
// representation as the original f32.
export const F32VecSchema = z
  .array(z.number())
  .transform(arr => new Float32Array(arr))

export const ViewVectorsSchema = z.object(perView(() => F32VecSchema))
export type ViewVectors = z.infer<typeof ViewVectorsSchema>

export const IndexedRecordSchema = z.object({
  text: RecordTextSchema,
  vectors: ViewVectorsSchema,
})
export type IndexedRecord = z.infer<typeof IndexedRecordSchema>

/** What every index shape declares about itself; `search-index.ts` reuses it. */
export const indexHeaderShape = {
  model: z.string(),
  dims: z.number().int(),
  normalized: z.boolean(),
  corpus_hash: z.string(),
}

export const VectorIndexSchema = z.object({
  // Any version — this is the in-memory shape, which `validateIndex`
  // judges; the artifact's JSON half pins the literal (`search-index.ts`).
  version: z.number().int(),
  ...indexHeaderShape,
  records: z.array(IndexedRecordSchema),
})
export type VectorIndex = z.infer<typeof VectorIndexSchema>

/** Parse + validate an index in inline JSON form (the parity fixture); the
 * vectors come back as `Float32Array`s. The built artifact: `search-index.ts`. */
export const loadVectorIndex = (raw: unknown): VectorIndex =>
  VectorIndexSchema.parse(raw)

const CategoryEntry = z.object({ id: z.string(), label: z.string() })
export const CategoriesSchema = z.object({
  version: z.literal(1),
  categories: z.array(CategoryEntry),
})
export type Category = z.infer<typeof CategoryEntry>
export type Categories = z.infer<typeof CategoriesSchema>

/** Display label for a category id; falls back to the raw id when
 * categories.json has no entry. */
export function categoryLabel(
  categories: readonly Category[],
  id: string,
): string {
  return categories.find(c => c.id === id)?.label ?? id
}

// Result types — produced by the ranker, not loaded from JSON.

/** The query's dot with each view vector of a record. */
export type SemanticScores = Record<View, number>

export interface Boosts {
  category: number
  lexical: number
}

export interface RankDebug {
  semantic: SemanticScores
  boosts: Boosts
}

export interface RankedMatch {
  rec: RecordText
  score: number
  debug: RankDebug
}

/** The lookup map's claim for a query: the resolver's canonical record. */
export type ResolverHit = RecordId
