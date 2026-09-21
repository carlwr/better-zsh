import type { Assert, Eq } from "@carlwr/typescript-extra"
import type {
  ArithOpDoc,
  BuiltinDoc,
  ComplexCommandDoc,
  CompUtilityDoc,
  CondOpDoc,
  DocRecordBase,
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

const docCategorySet: ReadonlySet<string> = new Set(docCategories)

/**
 * Validate a raw string against `docCategories`. Returns the value narrowed
 * to `DocCategory` when known, `undefined` otherwise. Use at trust boundaries
 * (request parameters, deserialised input) instead of an `as DocCategory`
 * cast. Case-sensitive.
 */
export const parseDocCategory = (raw: string): DocCategory | undefined =>
  docCategorySet.has(raw) ? (raw as DocCategory) : undefined

/** Type-guard form of `parseDocCategory`. */
export const isDocCategory = (raw: string): raw is DocCategory =>
  docCategorySet.has(raw)

// Order rationale (resolver-shadowing facts) lives in DESIGN.md §"The category walk".
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
  // to the function record rather than misresolving; see DESIGN.md §"The
  // category walk".
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
 * or collect all; the per-category step is `resolve`.
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

// Every record carries `category: K`, `id: Documented<K>` and `display` —
// the structural identity invariant (PRINCIPLES.md §"Category types").
type _AssertRecordsExtendBase = Assert<
  Eq<
    {
      [K in DocCategory]: DocRecordMap[K] extends DocRecordBase<K>
        ? true
        : false
    }[DocCategory],
    true
  >
>

/**
 * Any corpus record: the union over the categories, discriminated by
 * `category` — what the category walk hands out (`resolveAll`). For the
 * boundary where a record's category is a runtime fact; code inside stays
 * parametric over `K` (PRINCIPLES.md: no per-category branches downstream).
 */
export type DocRecord = DocRecordMap[DocCategory]

/**
 * A record's `category` under a generic `K`. TS reads
 * `DocRecordMap[K]["category"]` as the union of every category; the assert
 * above is what makes the narrowing sound. Single cast site.
 */
export const categoryOf = <K extends DocCategory>(rec: DocRecordMap[K]): K =>
  rec.category as K

/**
 * A record's `id` under a generic `K`. TS reads `DocRecordMap[K]["id"]` as
 * the union of every category's brand; the assert above is what makes the
 * narrowing sound. Single cast site.
 */
export const genericId = <K extends DocCategory>(
  rec: DocRecordMap[K],
): Documented<K> => rec.id as Documented<K>

/**
 * A record's typed sub-facet (`HistoryKind`, `ParamExpnSubKind`, a
 * cond-op's arity, ...) under a generic `K`; `undefined` for a category
 * that declares no `subKind`. A category declares it on every record or on
 * none, and its closed value set is the field's union — the released
 * schema's enum. Single cast site.
 */
export const subKindOf = <K extends DocCategory>(
  rec: DocRecordMap[K],
): string | undefined =>
  "subKind" in rec ? (rec as { readonly subKind: string }).subKind : undefined

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
