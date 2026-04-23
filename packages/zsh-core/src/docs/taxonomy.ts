import type { Assert, Eq } from "@carlwr/typescript-extra"
import type {
  ArithOpDoc,
  BuiltinDoc,
  ComplexCommandDoc,
  CondOpDoc,
  Documented,
  GlobFlagDoc,
  GlobOpDoc,
  GlobQualifierDoc,
  HistoryDoc,
  JobSpecDoc,
  KeymapDoc,
  ParamExpnDoc,
  ParamFlagDoc,
  PrecmdDoc,
  ProcessSubstDoc,
  PromptEscapeDoc,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  SpecialFunctionDoc,
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
  "complex_command",
  "reserved_word",
  "redir",
  "process_subst",
  "param_expn",
  "subscript_flag",
  "param_flag",
  "history",
  "glob_op",
  "glob_flag",
  "glob_qualifier",
  "prompt_escape",
  "zle_widget",
  "keymap",
  "job_spec",
  "arith_op",
  "special_function",
] as const

export type DocCategory = (typeof docCategories)[number]

// Order rationale (resolver-shadowing facts) lives in DESIGN.md §"Tie-break in classify".
// `param_expn` placement: its sigs are all literal templates (e.g. `${name:-word}`)
// that no real user-code token will match via `simpleResolver`; the category reaches
// consumers via search/describe rather than classify. Position is therefore
// irrelevant for shadowing; grouped with the other expansion-form categories.
// `complex_command` precedes `reserved_word`: a raw `for`, `while`, `[[`, etc.
// classifies as the structured complex-command record (rich synopsis +
// alternateForms), not the reserved-word boilerplate. See PRINCIPLES.md
// §"Overlap between categories is accepted".
const classifyOrderTuple = [
  "complex_command",
  "reserved_word",
  "precmd",
  "builtin",
  "cond_op",
  // special_function precedes option so `TRAPHUP` / `precmd_functions` resolve
  // to the function record rather than misclassifying; see DESIGN.md §"Tie-break
  // in classify".
  "special_function",
  "shell_param",
  "process_subst",
  "param_expn",
  "param_flag",
  "subscript_flag",
  "glob_flag",
  "glob_qualifier",
  "glob_op",
  "history",
  // prompt_escape precedes job_spec because `job_spec`'s `%string` fallback
  // would otherwise shadow `%n`, `%~`, `%F`, etc. Real job-spec tokens
  // (`%%`, `%1`, `%?foo`) have no prompt-escape conflict, so nothing is
  // lost by this ordering.
  "prompt_escape",
  "job_spec",
  "zle_widget",
  "keymap",
  // arith_op sits after cond_op so that `==`, `!=`, `<`, `>`, `<=`, `>=` prefer
  // the more common cond_op interpretation; bare arith ops (`**`, `<<`, `%`, ...)
  // still route here.
  "arith_op",
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
  complex_command: "complex command",
  reserved_word: "reserved word",
  redir: "redirection",
  process_subst: "process substitution",
  param_expn: "parameter-expansion form",
  subscript_flag: "subscript flag",
  param_flag: "parameter-expansion flag",
  history: "history designator",
  glob_op: "glob operator",
  glob_flag: "glob flag",
  glob_qualifier: "glob qualifier",
  prompt_escape: "prompt escape",
  zle_widget: "ZLE widget",
  keymap: "ZLE keymap",
  job_spec: "job spec",
  arith_op: "arithmetic operator",
  special_function: "special function",
}

export interface DocRecordMap {
  option: ZshOption
  cond_op: CondOpDoc
  builtin: BuiltinDoc
  precmd: PrecmdDoc
  shell_param: ShellParamDoc
  complex_command: ComplexCommandDoc
  reserved_word: ReservedWordDoc
  redir: RedirDoc
  process_subst: ProcessSubstDoc
  param_expn: ParamExpnDoc
  subscript_flag: SubscriptFlagDoc
  param_flag: ParamFlagDoc
  history: HistoryDoc
  glob_op: GlobOpDoc
  glob_flag: GlobFlagDoc
  glob_qualifier: GlobQualifierDoc
  prompt_escape: PromptEscapeDoc
  zle_widget: ZleWidgetDoc
  keymap: KeymapDoc
  job_spec: JobSpecDoc
  arith_op: ArithOpDoc
  special_function: SpecialFunctionDoc
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
  complex_command: d => d.name,
  reserved_word: d => d.name,
  redir: d => d.sig,
  process_subst: d => d.op as Documented<"process_subst">,
  param_expn: d => d.sig,
  subscript_flag: d => d.flag,
  param_flag: d => d.flag,
  history: d => d.key,
  glob_op: d => d.op,
  glob_flag: d => d.flag,
  glob_qualifier: d => d.flag,
  prompt_escape: d => d.key,
  zle_widget: d => d.name,
  keymap: d => d.name,
  job_spec: d => d.key,
  arith_op: d => d.op,
  special_function: d => d.name,
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

/**
 * Optional typed sub-facet of a doc record; `undefined` when a category has
 * no meaningful subKind.
 *
 * Surfaces record-level fields such as `HistoryKind`, `ZleWidgetKind`,
 * `ParamExpnSubKind`, `CondArity`, `ReservedWordPos`, and `GlobOpKind`.
 * Consumers (e.g. MCP search results) can forward this to give agents and
 * humans more structure than a bare id list.
 */
export const docSubKind: {
  [K in DocCategory]: (doc: DocRecordMap[K]) => string | undefined
} = {
  option: _ => undefined,
  cond_op: d => d.arity,
  builtin: _ => undefined,
  precmd: _ => undefined,
  shell_param: d => d.section,
  complex_command: _ => undefined,
  reserved_word: d => d.pos,
  redir: _ => undefined,
  process_subst: _ => undefined,
  param_expn: d => d.subKind,
  subscript_flag: _ => undefined,
  param_flag: _ => undefined,
  history: d => d.kind,
  glob_op: d => d.kind,
  glob_flag: _ => undefined,
  glob_qualifier: _ => undefined,
  prompt_escape: d => d.section,
  zle_widget: d => `${d.kind}:${d.section}`,
  keymap: d => (d.isSpecial ? "special" : "regular"),
  job_spec: d => d.kind,
  arith_op: d => d.arity,
  special_function: d => d.kind,
}
