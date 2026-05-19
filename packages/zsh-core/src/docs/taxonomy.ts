import type { Assert, Eq } from "@carlwr/typescript-extra"
import type {
  ArithOpDoc,
  BuiltinDoc,
  ComplexCommandDoc,
  CompUtilityDoc,
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
  "conditional_op",
  "builtin",
  "precmd_modifier",
  "special_param",
  "complex_command",
  "reserved_word",
  "redirection",
  "process_subst",
  "param_expn",
  // Deliberately short; exact alternatives are too long.
  "subscript_flag",
  "param_expn_flag",
  "history_expn",
  "glob_op",
  "glob_flag",
  "glob_qualifier",
  "prompt_escape",
  "zle_widget",
  "keymap",
  "job_spec",
  "arith_op",
  "special_function",
  "comp_utility",
] as const

export type DocCategory = (typeof docCategories)[number]

// Order rationale (resolver-shadowing facts) lives in DESIGN.md §"Tie-break in docs".
// `param_expn` placement: its sigs are all literal templates (e.g. `${name:-word}`)
// that no real user-code token will match via `simpleResolver`; the category reaches
// consumers via search/docs rather than raw-token resolution. Position is therefore
// irrelevant for shadowing; grouped with the other expansion-form categories.
// `complex_command` precedes `reserved_word`: a raw `for`, `while`, `[[`, etc.
// classifies as the structured complex-command record (rich synopsis +
// alternateForms), not the reserved-word boilerplate. See PRINCIPLES.md
// §"Overlap between categories is accepted".
const classifyOrderTuple = [
  "complex_command",
  "reserved_word",
  "precmd_modifier",
  "builtin",
  "conditional_op",
  // special_function precedes option so `TRAPHUP` / `precmd_functions` resolve
  // to the function record rather than misresolving; see DESIGN.md §"Tie-break
  // in docs".
  "special_function",
  "special_param",
  "process_subst",
  "param_expn",
  "param_expn_flag",
  "subscript_flag",
  "glob_flag",
  "glob_qualifier",
  "glob_op",
  "history_expn",
  // prompt_escape precedes job_spec because `job_spec`'s `%string` fallback
  // would otherwise shadow `%n`, `%~`, `%F`, etc. Real job-spec tokens
  // (`%%`, `%1`, `%?foo`) have no prompt-escape conflict, so nothing is
  // lost by this ordering.
  "prompt_escape",
  "job_spec",
  "zle_widget",
  "keymap",
  // arith_op sits after conditional_op so that `==`, `!=`, `<`, `>`, `<=`, `>=` prefer
  // the more common conditional_op interpretation; bare arith ops (`**`, `<<`, `%`, ...)
  // still route here.
  "arith_op",
  "option",
  "redirection",
  "comp_utility",
] as const satisfies readonly DocCategory[]

// Bidirectional set-equality of `docCategories` and `classifyOrderTuple`:
// (1) every `DocCategory` is in `classifyOrderTuple` (no missed categories);
// (2) every `classifyOrderTuple` entry is a `DocCategory` (no extras).
type _AssertClassifyOrderComplete = Assert<
  Eq<Exclude<DocCategory, (typeof classifyOrderTuple)[number]>, never>
>
type _AssertClassifyOrderNoExtras = Assert<
  Eq<Exclude<(typeof classifyOrderTuple)[number], DocCategory>, never>
>

/**
 * `DocCategory` list ordered for resolver walks. Consumers may stop on the
 * first match or collect every resolving category.
 */
export const classifyOrder: readonly DocCategory[] = classifyOrderTuple

/**
 * Human-readable singular label per `DocCategory`. Prefer interpolating
 * from this table over hand-typing category names.
 */
export const docCategoryLabels: Readonly<Record<DocCategory, string>> = {
  option: "option",
  conditional_op: "conditional operator",
  builtin: "builtin",
  precmd_modifier: "precommand modifier",
  special_param: "special parameter",
  complex_command: "complex command",
  reserved_word: "reserved word",
  redirection: "redirection",
  process_subst: "process substitution",
  param_expn: "parameter-expansion form",
  subscript_flag: "parameter-subscript flag",
  param_expn_flag: "parameter-expansion flag",
  history_expn: "history-expansion component",
  glob_op: "glob operator",
  glob_flag: "glob flag",
  glob_qualifier: "glob qualifier",
  prompt_escape: "prompt escape",
  zle_widget: "ZLE widget",
  keymap: "ZLE keymap",
  job_spec: "job spec",
  arith_op: "arithmetic operator",
  special_function: "special function",
  comp_utility: "completion utility",
}

export interface DocRecordMap {
  option: ZshOption
  conditional_op: CondOpDoc
  builtin: BuiltinDoc
  precmd_modifier: PrecmdDoc
  special_param: ShellParamDoc
  complex_command: ComplexCommandDoc
  reserved_word: ReservedWordDoc
  redirection: RedirDoc
  process_subst: ProcessSubstDoc
  param_expn: ParamExpnDoc
  subscript_flag: SubscriptFlagDoc
  param_expn_flag: ParamFlagDoc
  history_expn: HistoryDoc
  glob_op: GlobOpDoc
  glob_flag: GlobFlagDoc
  glob_qualifier: GlobQualifierDoc
  prompt_escape: PromptEscapeDoc
  zle_widget: ZleWidgetDoc
  keymap: KeymapDoc
  job_spec: JobSpecDoc
  arith_op: ArithOpDoc
  special_function: SpecialFunctionDoc
  comp_utility: CompUtilityDoc
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
  conditional_op: d => d.op,
  builtin: d => d.name,
  precmd_modifier: d => d.name as Documented<"precmd_modifier">,
  special_param: d => d.name,
  complex_command: d => d.name,
  reserved_word: d => d.name,
  redirection: d => d.slug,
  process_subst: d => d.op as Documented<"process_subst">,
  param_expn: d => d.sig,
  subscript_flag: d => d.flag,
  param_expn_flag: d => d.flag,
  history_expn: d => d.key,
  glob_op: d => d.op,
  glob_flag: d => d.flag,
  glob_qualifier: d => d.flag,
  prompt_escape: d => d.key,
  zle_widget: d => d.name,
  keymap: d => d.name,
  job_spec: d => d.key,
  arith_op: d => d.op,
  special_function: d => d.name,
  comp_utility: d => d.name,
}

/**
 * Display heading for a doc record; may differ from the typed id.
 *
 * The id is a shell-safe slug (printable ASCII, no whitespace) suitable as a
 * stable lookup key; the display is the human-readable surface form. Most
 * categories collapse the two — display equals id verbatim. Divergent
 * categories:
 *
 * - `option`: id is the normalized lookup key (`autocd`); display preserves
 *   upstream case and underscores (`AUTO_CD`).
 * - `redirection`: id is `slug` (`>_word`); display is `sig` (`> word`).
 * - `param_expn_flag`, `subscript_flag`: id is the bare flag letter (`j`);
 *   display is the full sig with placeholders (`j:string:`).
 * - `history_expn`: id is the bare letter for modifiers (`h`); display is
 *   the full sig (`h [ digits ]`). Event/word designators are unchanged.
 *
 * Consumers that render doc records to users (hover UIs, MCP tool responses,
 * dumps) should prefer this function over reading identity fields directly.
 */
export const docDisplay = <K extends DocCategory>(
  cat: K,
  doc: DocRecordMap[K],
): string => {
  switch (cat) {
    case "option":
      return (doc as ZshOption).display
    case "redirection":
    case "param_expn_flag":
    case "subscript_flag":
    case "history_expn":
      return (doc as { readonly sig: string }).sig
    default:
      return docId[cat](doc as never) as string
  }
}

/**
 * Optional typed sub-facet of a doc record; `undefined` when a category has
 * no meaningful subKind.
 *
 * Surfaces record-level fields such as `HistoryKind`, `ZleWidgetKind`,
 * `ParamExpnSubKind`, `CondArity`, `ReservedWordPos`, and `GlobOpKind`.
 * Consumers (e.g. MCP search results) can forward this to give agents and
 * humans more structure than a bare id list.
 */
// Categories without a meaningful subKind fall through to `noSub` (returns
// `undefined`); only those that DO expose a sub-facet appear below. The
// per-category table is materialized from these overrides so consumers can
// access `docSubKind[cat](doc)` uniformly.
const noSub = (_: unknown) => undefined

type SubKindFn<K extends DocCategory> = (
  doc: DocRecordMap[K],
) => string | undefined

type SubKindFnMap = { [K in DocCategory]: SubKindFn<K> }

const subKindOverrides: Partial<SubKindFnMap> = {
  conditional_op: d => d.arity,
  special_param: d => d.scope,
  reserved_word: d => d.pos,
  param_expn: d => d.subKind,
  history_expn: d => d.kind,
  glob_op: d => d.kind,
  prompt_escape: d => d.section,
  zle_widget: d => `${d.kind}:${d.section}`,
  keymap: d => (d.isSpecial ? "special" : "regular"),
  job_spec: d => d.kind,
  arith_op: d => d.arity,
  special_function: d => d.kind,
}

export const docSubKind: SubKindFnMap = Object.fromEntries(
  docCategories.map(cat => [cat, subKindOverrides[cat] ?? noSub]),
) as SubKindFnMap
