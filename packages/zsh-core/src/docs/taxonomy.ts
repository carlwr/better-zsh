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
  MathfuncDoc,
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
  "mathfunc",
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
  // mathfunc after arith_op: callable names resolved in arith context, lower
  // shadowing priority than operators.
  "mathfunc",
  "option",
  "redirection",
  "comp_utility",
] as const satisfies readonly DocCategory[]

// Set-equality of `docCategories` and `classifyOrderTuple`: no missed
// categories, no extras.
type _AssertClassifyOrderComplete = Assert<
  Eq<Exclude<DocCategory, (typeof classifyOrderTuple)[number]>, never>
>
type _AssertClassifyOrderNoExtras = Assert<
  Eq<Exclude<(typeof classifyOrderTuple)[number], DocCategory>, never>
>

/**
 * `DocCategory` list in resolver-walk order. Consumers stop on first match
 * or collect all.
 */
export const classifyOrder: readonly DocCategory[] = classifyOrderTuple

/** Human-readable singular label per `DocCategory`. */
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
  mathfunc: "math function",
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
  mathfunc: MathfuncDoc
  special_function: SpecialFunctionDoc
  comp_utility: CompUtilityDoc
}

/**
 * Discriminated-union identity for a documented corpus element. `category`
 * narrows `id` to the matching Documented brand.
 *
 * Sanctioned acquisitions: `resolve(corpus, cat, raw)`, `mkPieceId(cat,
 * record-id)` from a corpus record, or internal corpus iteration.
 */
export type DocPieceId = {
  [K in DocCategory]: { readonly category: K; readonly id: Documented<K> }
}[DocCategory]

/**
 * Construct a `DocPieceId`. Centralizes the correlated-union cast TS cannot
 * propagate through a generic. Valid only when the id is genuinely a corpus
 * key (typically read off a corpus record).
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
  precmd_modifier: d => d.name,
  special_param: d => d.name,
  complex_command: d => d.name,
  reserved_word: d => d.name,
  redirection: d => d.slug,
  process_subst: d => d.op,
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
  mathfunc: d => d.name,
  special_function: d => d.name,
  comp_utility: d => d.name,
}

/**
 * Display heading for a doc record; may differ from the typed id (a
 * shell-safe slug). Divergent categories:
 *
 * - `option`: id `autocd`, display `AUTO_CD` (preserves upstream case/underscores).
 * - `redirection`: id `slug` (`>_word`), display `sig` (`> word`).
 * - `param_expn_flag`, `subscript_flag`: id `j`, display `j:string:`.
 * - `history_expn`: id `h` for modifiers, display `h [ digits ]`. Event/word
 *   designators unchanged.
 *
 * User-facing renderers (hover, MCP tool responses, dumps) should prefer
 * this over reading identity fields directly.
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
      return idOf(cat, doc) as string
  }
}

/**
 * Optional typed sub-facet of a doc record; `undefined` when a category has
 * no meaningful subKind. Surfaces record-level fields (`HistoryKind`,
 * `ParamExpnSubKind`, `CondArity`, ...) so consumers (MCP search results) can
 * give more structure than a bare id list.
 */
// Categories with a sub-facet override `noSub`; `docSubKind` materializes all.
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

/**
 * Parametric `docId[cat](doc)`. Single dispatch-cast site — prefer this over
 * indexing `docId` directly when `cat` is a generic `K`.
 */
export const idOf = <K extends DocCategory>(
  cat: K,
  doc: DocRecordMap[K],
): Documented<K> => (docId[cat] as (d: DocRecordMap[K]) => Documented<K>)(doc)

/**
 * Parametric `docSubKind[cat](doc)`. Single dispatch-cast site — prefer this
 * over indexing `docSubKind` directly when `cat` is a generic `K`.
 */
export const subKindOf = <K extends DocCategory>(
  cat: K,
  doc: DocRecordMap[K],
): string | undefined =>
  (docSubKind[cat] as (d: DocRecordMap[K]) => string | undefined)(doc)

/**
 * Canonical zsh loadable-module string set. Values of any `module?:` field
 * across the corpus must come from this list.
 */
export const moduleNames = [
  "zsh/attr",
  "zsh/cap",
  "zsh/clone",
  "zsh/compctl",
  "zsh/complete",
  "zsh/complist",
  "zsh/computil",
  "zsh/curses",
  "zsh/datetime",
  "zsh/db/gdbm",
  "zsh/deltochar",
  "zsh/example",
  "zsh/files",
  "zsh/langinfo",
  "zsh/mapfile",
  "zsh/mathfunc",
  "zsh/nearcolor",
  "zsh/net/socket",
  "zsh/net/tcp",
  "zsh/newuser",
  "zsh/param/private",
  "zsh/parameter",
  "zsh/pcre",
  "zsh/regex",
  "zsh/rlimits",
  "zsh/sched",
  "zsh/stat",
  "zsh/system",
  "zsh/termcap",
  "zsh/terminfo",
  "zsh/watch",
  "zsh/zftp",
  "zsh/zle",
  "zsh/zleparameter",
  "zsh/zprof",
  "zsh/zpty",
  "zsh/zselect",
  "zsh/zutil",
] as const

export type ModuleName = (typeof moduleNames)[number]

const moduleNameSet: ReadonlySet<string> = new Set(moduleNames)

/**
 * Validate a raw string against the canonical `moduleNames`. Returns the
 * value narrowed to `ModuleName` when known, `undefined` otherwise. Use at
 * trust boundaries (parsing upstream prose, deserialising external input) to
 * avoid unchecked `as ModuleName` casts.
 */
export const parseModuleName = (raw: string): ModuleName | undefined =>
  moduleNameSet.has(raw) ? (raw as ModuleName) : undefined

/** Type-guard form of `parseModuleName`. */
export const isModuleName = (raw: string): raw is ModuleName =>
  moduleNameSet.has(raw)
