import type { JsonDataFile } from "./json-artifacts.ts"
import type {
  ResolverFeedback,
  ResolverFeedbackKindSchema,
} from "./resolver.ts"
import type { DocCategory, DocRecordMap } from "./taxonomy.ts"

// Generated fields attached to every JSON record; the in-memory corpus omits
// them. All are `_`-prefixed, the rendered markdown body included — a
// namespace apart from the records' own field names. Deliberately no JSDoc
// here: the schema generator would make it the description of every record.
// `_id` / `_display` patterns mirror the corpus-ASCII test's `ID_RE` /
// `SURFACE_RE` — keep aligned.
export type WithMarkdown<T> = T & {
  /**
   * The rendered record as markdown; `_title` is split out of it, and the
   * category is the envelope's (`_subKind` and the file's category), not the
   * body's. Empty for a record without prose.
   */
  readonly _mdBody: string
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
   * record name); split out of `_mdBody` so each consumer decides whether to
   * show it.
   */
  readonly _title: string
  // schema: required + enum per category, see build-schema.ts
  readonly _subKind?: string
}

export type JsonRecordMap = {
  readonly [K in DocCategory]: WithMarkdown<DocRecordMap[K]>
}
export type JsonDocArrayMap = {
  [K in DocCategory]: readonly JsonRecordMap[K][]
}

/**
 * `index.json`: what a consumer needs to read the record files and mirror
 * the taxonomy. `version` moves with the shape of this object or of the
 * record file set, never with record content (that is `dataHash`).
 */
export interface JsonIndex {
  readonly version: 2
  readonly packageVersion: string
  readonly zshUpstream: {
    readonly tag: string
    readonly commit: string
    readonly date: string
  }
  /** SHA-256 over the emitted record files, `index.json` excluded — corpus-content identity, independent of `packageVersion`. */
  readonly dataHash: string
  /** Every record file, sorted by name. */
  readonly files: readonly JsonDataFile[]
  /** Canonical list of `DocCategory` values, in primary ordering. */
  readonly docCategories: readonly DocCategory[]
  /** Resolver-walk order for raw-token lookup. */
  readonly classifyOrder: readonly DocCategory[]
  /** Per-category JSON filename — pairs each `docCategories` entry with the file holding its records. */
  readonly categoryFiles: { readonly [K in DocCategory]: `${K}.json` }
  /** Human-readable per-category labels — SoT for display in out-of-process consumers. */
  readonly docCategoryLabels: { readonly [K in DocCategory]: string }
  /** One closed JSON Schema per `ResolverFeedback` kind, in `resolverFeedbackKinds` order — what a resolver mirror's output schemas embed. */
  readonly resolverFeedbackKindSchemas: readonly ResolverFeedbackKindSchema[]
}

/** What the resolvers answer for one raw input; `null` where they answer nothing. */
export interface ResolverFixtureCase {
  readonly input: string
  /** The `resolve` hit — direct corpus-key lookup, then the category's resolver. */
  readonly id: string | null
  readonly feedback: ResolverFeedback | null
}

/** @minItems 1 */
export type ResolverFixtureCases = readonly ResolverFixtureCase[]

/** One hit of the category walk: a category's `resolve` answer, admitted to the walk. */
export interface WalkFixtureHit {
  readonly category: DocCategory
  readonly id: string
  readonly feedback: ResolverFeedback | null
}

/** What `resolveAll` answers for one raw input, in `classifyOrder`; empty where nothing resolves. */
export interface WalkFixtureCase {
  readonly input: string
  readonly hits: readonly WalkFixtureHit[]
}

/** @minItems 1 */
export type WalkFixtureCases = readonly WalkFixtureCase[]

/**
 * Resolver conformance fixture: per category, pinned and generated inputs with
 * the answers computed over the corpus identified by `dataHash`; then the
 * category walk's answers (`walk`) — order and admission — for the pinned
 * inputs and every record's id and display. A mirror resolver is conformant
 * when it gives the same answers.
 */
export interface ResolverFixtureJson {
  readonly version: 2
  readonly packageVersion: string
  /** `JsonIndex.dataHash` of the corpus the answers were computed over. */
  readonly dataHash: string
  readonly cases: { readonly [K in DocCategory]: ResolverFixtureCases }
  readonly walk: WalkFixtureCases
}
