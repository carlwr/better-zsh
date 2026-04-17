import type { Assert, Eq } from "@carlwr/typescript-extra"
import type {
  BuiltinDoc,
  CondOpDoc,
  Documented,
  GlobFlagDoc,
  GlobOpDoc,
  HistoryDoc,
  ParamFlagDoc,
  PrecmdDoc,
  ProcessSubstDoc,
  PromptEscapeDoc,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  SubscriptFlagDoc,
  ZleWidgetDoc,
  ZshOption,
} from "./types.ts"

export const docCategories = [
  "option",
  "cond_op",
  "builtin",
  "precmd",
  "shell_param",
  "reserved_word",
  "redir",
  "process_subst",
  "subscript_flag",
  "param_flag",
  "history",
  "glob_op",
  "glob_flag",
  "prompt_escape",
  "zle_widget",
] as const

export type DocCategory = (typeof docCategories)[number]

// Order rationale (resolver-shadowing facts) lives in DESIGN.md §"Tie-break in classify".
const classifyOrderTuple = [
  "reserved_word",
  "precmd",
  "builtin",
  "cond_op",
  "shell_param",
  "process_subst",
  "param_flag",
  "subscript_flag",
  "glob_flag",
  "glob_op",
  "history",
  "prompt_escape",
  "zle_widget",
  "option",
  "redir",
] as const satisfies readonly DocCategory[]

type _AssertClassifyOrderComplete = Assert<
  Eq<Exclude<DocCategory, (typeof classifyOrderTuple)[number]>, never>
>

/**
 * `DocCategory` list ordered for first-hit classification: walk, call
 * `resolve(corpus, cat, raw)` per entry, stop on the first match.
 */
export const classifyOrder: readonly DocCategory[] = classifyOrderTuple

/**
 * Human-readable singular label per `DocCategory`. Prefer interpolating
 * from this table over hand-typing category names.
 */
export const docCategoryLabels: Readonly<Record<DocCategory, string>> = {
  option: "option",
  cond_op: "conditional operator",
  builtin: "builtin",
  precmd: "precommand modifier",
  shell_param: "shell parameter",
  reserved_word: "reserved word",
  redir: "redirection",
  process_subst: "process substitution",
  subscript_flag: "subscript flag",
  param_flag: "parameter-expansion flag",
  history: "history designator",
  glob_op: "glob operator",
  glob_flag: "glob flag",
  prompt_escape: "prompt escape",
  zle_widget: "ZLE widget",
}

export interface DocRecordMap {
  option: ZshOption
  cond_op: CondOpDoc
  builtin: BuiltinDoc
  precmd: PrecmdDoc
  shell_param: ShellParamDoc
  reserved_word: ReservedWordDoc
  redir: RedirDoc
  process_subst: ProcessSubstDoc
  subscript_flag: SubscriptFlagDoc
  param_flag: ParamFlagDoc
  history: HistoryDoc
  glob_op: GlobOpDoc
  glob_flag: GlobFlagDoc
  prompt_escape: PromptEscapeDoc
  zle_widget: ZleWidgetDoc
}

/**
 * Discriminated-union identity for a documented corpus element.
 * `category` narrows `id` to the corresponding Documented brand.
 *
 * The only sanctioned ways to obtain a `DocPieceId` are: the return of
 * `resolve(corpus, cat, raw)`, assembling one from a corpus record's id field
 * via `mkPieceId(cat, record-id)`, or iterating the corpus internally.
 */
export type DocPieceId = {
  [K in DocCategory]: { readonly category: K; readonly id: Documented<K> }
}[DocCategory]

/**
 * Construct a `DocPieceId` from a category and a documented id. Centralizes
 * the correlated-union cast that TS cannot propagate through a generic
 * helper. Valid to call only when the id genuinely is a corpus key (typically
 * because it was read off a corpus record).
 */
export const mkPieceId = <K extends DocCategory>(
  category: K,
  id: Documented<K>,
): DocPieceId => ({ category, id }) as DocPieceId

export const docId: {
  [K in DocCategory]: (doc: DocRecordMap[K]) => Documented<K>
} = {
  option: d => d.name,
  cond_op: d => d.op,
  builtin: d => d.name,
  precmd: d => d.name as Documented<"precmd">,
  shell_param: d => d.name,
  reserved_word: d => d.name,
  redir: d => d.sig,
  process_subst: d => d.op as Documented<"process_subst">,
  subscript_flag: d => d.flag,
  param_flag: d => d.flag,
  history: d => d.key,
  glob_op: d => d.op,
  glob_flag: d => d.flag,
  prompt_escape: d => d.key,
  zle_widget: d => d.name,
}

/**
 * Display heading for a doc record; may differ from the typed id.
 *
 * For most categories the display is the id verbatim. `option` diverges: its
 * `.display` preserves human-oriented case and underscores (`AUTO_CD`) while
 * its `.name` is the normalized lookup key (`autocd`). Consumers that render
 * doc records to users (hover UIs, MCP tool responses, dumps) should prefer
 * this function over reading identity fields directly.
 */
export const docDisplay = <K extends DocCategory>(
  cat: K,
  doc: DocRecordMap[K],
): string =>
  cat === "option"
    ? (doc as ZshOption).display
    : (docId[cat](doc as never) as string)
