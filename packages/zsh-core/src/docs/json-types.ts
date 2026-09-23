import type { ResolverFeedback } from "./resolver.ts"
import type { DocCategory, DocRecordMap } from "./taxonomy.ts"

// Generated fields attached to every JSON record; the in-memory corpus omits
// them. Both are `_`-prefixed — a namespace apart from the records' own field
// names — and are `RenderedRecord`'s fields. Deliberately no JSDoc here: the
// schema generator would make it the description of every record.
export type WithMarkdown<T> = T & {
  /**
   * The record's body as markdown; the title is `_title`, and the category
   * is the record's `category`, not the body's.
   * Empty for a record without prose.
   */
  readonly _mdBody: string
  /**
   * Record title — short inline markdown (e.g. the backticked record name);
   * apart from `_mdBody` so each consumer decides whether to show it.
   */
  readonly _title: string
}

/** A JSON record per category: the corpus record plus the generated fields. */
export type JsonRecordMap = {
  readonly [K in DocCategory]: WithMarkdown<DocRecordMap[K]>
}
/** `records.json`: every category's record array under its category, in primary category order. */
export type JsonDocArrayMap = {
  [K in DocCategory]: readonly JsonRecordMap[K][]
}

/** One self-contained JSON Schema object (draft 2020-12, no `$ref`). */
export type JsonSchemaObject = Readonly<Record<string, unknown>>

/** One category row in `JsonIndex.categories`. */
export interface JsonCategoryDescriptor {
  readonly id: DocCategory
  readonly label: string
  /** How to interpret this category's record fields, where the records are not intelligible without it (`docCategoryPreamble`). */
  readonly preamble?: string
}

/**
 * `index.json`: what a consumer needs to read the record file and mirror
 * the taxonomy. `version` moves with the shape of this object, of the
 * record file or of the record envelope (`category`, `id`, `display`, the
 * generated fields) — never with record content (that is `dataHash`) or
 * with a category's own fields (the records schema describes those).
 */
export interface JsonIndex {
  readonly version: 7
  readonly packageVersion: string
  readonly zshUpstream: {
    readonly tag: string
    readonly commit: string
    readonly date: string
  }
  /** SHA-256 of `records.json`'s bytes — corpus-content identity, independent of `packageVersion`. */
  readonly dataHash: string
  /** Category identity and display metadata, in primary category order — `records.json`'s key order. */
  readonly categories: readonly JsonCategoryDescriptor[]
  /** Resolver-walk order for raw-token lookup. */
  readonly classifyOrder: readonly DocCategory[]
  /**
   * `ResolverFeedback`'s JSON Schema, generated from the type — the fixture
   * schema's def, same object. Each `anyOf` branch is one kind, closed on
   * `properties.kind.const`; a resolver mirror embeds it in its output
   * schemas and matches its kinds by that const.
   */
  readonly resolverFeedbackSchema: JsonSchemaObject
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
