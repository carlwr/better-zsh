import type { JsonDataFile } from "./json-artifacts.ts"
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
/** The record files: `<category>.json` is the array under its category. */
export type JsonDocArrayMap = {
  [K in DocCategory]: readonly JsonRecordMap[K][]
}

/** One self-contained JSON Schema object (draft 2020-12, no `$ref`). */
export type JsonSchemaObject = Readonly<Record<string, unknown>>

/**
 * `index.json`: what a consumer needs to read the record files and mirror
 * the taxonomy. `version` moves with the shape of this object, of the
 * record file set or of the record envelope (`category`, `id`, `display`,
 * the generated fields) — never with record content (that is `dataHash`)
 * or with a category's own fields (the records schema describes those).
 */
export interface JsonIndex {
  readonly version: 5
  readonly packageVersion: string
  readonly zshUpstream: {
    readonly tag: string
    readonly commit: string
    readonly date: string
  }
  /** SHA-256 over the emitted record files, `index.json` excluded — corpus-content identity, independent of `packageVersion`. */
  readonly dataHash: string
  /** Every record file, sorted by name — the inventory: what to embed or copy, with nothing missing. */
  readonly files: readonly JsonDataFile[]
  /** Canonical list of `DocCategory` values, in primary ordering. */
  readonly docCategories: readonly DocCategory[]
  /** Resolver-walk order for raw-token lookup. */
  readonly classifyOrder: readonly DocCategory[]
  /** Per-category JSON filename — the role: which file holds a category's records. Derivable from `docCategories`; carried so a reader needs no naming rule. */
  readonly categoryFiles: { readonly [K in DocCategory]: `${K}.json` }
  /** Human-readable per-category labels — SoT for display in out-of-process consumers. */
  readonly docCategoryLabels: { readonly [K in DocCategory]: string }
  /** Category-level note where records need one to be read on their own — `docCategoryPreamble` at the TS root; absent key = none. */
  readonly docCategoryPreamble: { readonly [K in DocCategory]?: string }
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
