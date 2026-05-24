import type { JsonCountKey, JsonDataFile } from "./json-artifacts.ts"
import type { DocCategory, DocRecordMap } from "./taxonomy.ts"

type BrandTag =
  | { readonly __documented: unknown }
  | { readonly __observed: unknown }
  | { readonly __brand: unknown }

/**
 * Project source types to their JSON shape: strip phantom brands, and
 * collapse every tuple (homogeneous or otherwise) to a plain readonly array
 * of its element-union type so the emitted JSON schema describes the field
 * as an array, not as a positional object keyed by `"0"`, `"1"`, … . The
 * collapse covers `NonEmpty<T>` (i.e. `[T, ...T[]]`) as well as fixed-arity
 * tuples like `BinaryCondOpDoc.operands` and any future nested tuple field
 * (e.g. `FlagEntry.sigs`) — no per-field override required.
 */
type Unbrand<T> = T extends string & BrandTag
  ? string
  : T extends readonly (infer U)[]
    ? readonly Unbrand<U>[]
    : T extends object
      ? { readonly [K in keyof T]: Unbrand<T[K]> }
      : T

type JsonDoc<K extends DocCategory> = Unbrand<DocRecordMap[K]>

/**
 * Generated fields attached to every JSON record at build time. The
 * in-memory corpus omits these — they are projected during JSON emission
 * for out-of-process consumers.
 *
 * `_id` / `_display` patterns mirror the corpus-ASCII test's
 * `ID_RE` / `SURFACE_RE` — keep aligned.
 */
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
  readonly _subKind?: string
}

export type JsonRecordMap = {
  [K in DocCategory]: WithMarkdown<JsonDoc<K>>
}
export type JsonDocArrayMap = {
  [K in DocCategory]: readonly JsonRecordMap[K][]
}

// Per-category schema-root aliases. `scripts/build-schema.ts` resolves these
// by string name (via `jsonArtifact[cat].schema`); ts-json-schema-generator
// cannot follow generic instantiations, so each name must exist as its own
// `export type`. New `DocCategory` -> add the matching alias here.

export type OptionsJson = JsonDocArrayMap["option"]
export type ConditionalOpsJson = JsonDocArrayMap["conditional_op"]
export type ComplexCommandsJson = JsonDocArrayMap["complex_command"]
export type BuiltinsJson = JsonDocArrayMap["builtin"]
export type PrecmdModifiersJson = JsonDocArrayMap["precmd_modifier"]
export type SpecialParamsJson = JsonDocArrayMap["special_param"]
export type ReservedWordsJson = JsonDocArrayMap["reserved_word"]
export type RedirectionsJson = JsonDocArrayMap["redirection"]
export type ProcessSubstsJson = JsonDocArrayMap["process_subst"]
export type ParamExpnsJson = JsonDocArrayMap["param_expn"]
export type SubscriptFlagsJson = JsonDocArrayMap["subscript_flag"]
export type ParamExpnFlagsJson = JsonDocArrayMap["param_expn_flag"]
export type HistoryExpnsJson = JsonDocArrayMap["history_expn"]
export type GlobOperatorsJson = JsonDocArrayMap["glob_op"]
export type GlobFlagsJson = JsonDocArrayMap["glob_flag"]
export type GlobQualifiersJson = JsonDocArrayMap["glob_qualifier"]
export type PromptEscapesJson = JsonDocArrayMap["prompt_escape"]
export type ZleWidgetsJson = JsonDocArrayMap["zle_widget"]
export type KeymapsJson = JsonDocArrayMap["keymap"]
export type JobSpecsJson = JsonDocArrayMap["job_spec"]
export type ArithOpsJson = JsonDocArrayMap["arith_op"]
export type MathfuncsJson = JsonDocArrayMap["mathfunc"]
export type SpecialFunctionsJson = JsonDocArrayMap["special_function"]
export type CompUtilsJson = JsonDocArrayMap["comp_utility"]

export type JsonCounts = { readonly [K in JsonCountKey]: number }

export interface JsonIndex {
  readonly version: 1
  readonly packageVersion: string
  readonly zshUpstream: {
    readonly tag: string
    readonly commit: string
    readonly date: string
  }
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
