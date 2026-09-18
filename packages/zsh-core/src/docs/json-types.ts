import type { JsonCountKey, JsonDataFile } from "./json-artifacts.ts"
import type { ResolverFeedback } from "./resolver.ts"
import type { DocCategory, DocRecordMap } from "./taxonomy.ts"

// Generated fields attached to every JSON record; the in-memory corpus omits
// them. Deliberately no JSDoc here: the schema generator would make it the
// description of every record. `_id` / `_display` patterns mirror the
// corpus-ASCII test's `ID_RE` / `SURFACE_RE` — keep aligned.
export type WithMarkdown<T> = T & {
  readonly mdBody: string
  /**
   * Shell-safe identity slug: printable ASCII, no whitespace, non-empty.
   * @pattern ^[\x21-\x7E]+$
   */
  readonly _id: string
  /**
   * Surface form for display: printable ASCII with spaces; non-empty.
   * @pattern ^[\x20-\x7E]+$
   */
  readonly _display: string
  /**
   * Rendered record title — short inline markdown (e.g. the backticked
   * record name); split out of `mdBody` so each consumer decides whether to
   * show it.
   */
  readonly _title: string
  // schema: required + enum per category, see build-schema.ts
  readonly _subKind?: string
}

// No intermediate alias for the record type: the schema generator would name
// every record definition after it (a gensym) instead of the record type.
export type JsonRecordMap = {
  readonly [K in DocCategory]: WithMarkdown<DocRecordMap[K]>
}
export type JsonDocArrayMap = {
  [K in DocCategory]: readonly JsonRecordMap[K][]
}

export type JsonCounts = { readonly [K in JsonCountKey]: number }

export interface JsonIndex {
  readonly version: 1
  readonly packageVersion: string
  readonly zshUpstream: {
    readonly tag: string
    readonly commit: string
    readonly date: string
  }
  /** SHA-256 over the emitted record files, `index.json` excluded — corpus-content identity, independent of `packageVersion`. */
  readonly dataHash: string
  readonly files: readonly JsonDataFile[]
  readonly counts: JsonCounts
  /** Canonical list of `DocCategory` values, in primary ordering. */
  readonly docCategories: readonly string[]
  /** Resolver-walk order for raw-token lookup. */
  readonly classifyOrder: readonly string[]
  /** Per-category JSON filename — pairs each `docCategories` entry with the file holding its records. */
  readonly categoryFiles: { readonly [K in DocCategory]: JsonDataFile }
  /** Human-readable per-category labels — SoT for display in out-of-process consumers. */
  readonly docCategoryLabels: { readonly [K in DocCategory]: string }
  /** Hook base names used by the special-function resolver. */
  readonly hookNames: readonly string[]
}

/** What the resolvers answer for one raw input; `null` where they answer nothing. */
export interface ResolverFixtureCase {
  readonly input: string
  /** `lookupRaw` result — direct corpus-key lookup, then the category's resolver. */
  readonly id: string | null
  readonly feedback: ResolverFeedback | null
}

/** @minItems 1 */
export type ResolverFixtureCases = readonly ResolverFixtureCase[]

/**
 * Resolver conformance fixture: per category, pinned and generated inputs with
 * the answers computed over the corpus identified by `dataHash`. A mirror
 * resolver is conformant when it gives the same answers.
 */
export interface ResolverFixtureJson {
  readonly version: 1
  readonly packageVersion: string
  /** `JsonIndex.dataHash` of the corpus the answers were computed over. */
  readonly dataHash: string
  readonly cases: { readonly [K in DocCategory]: ResolverFixtureCases }
}
