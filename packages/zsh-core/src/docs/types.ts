import type { NonEmpty } from "@carlwr/typescript-extra"

import type { DocCategory, ModuleName } from "./taxonomy.ts"

/** Phantom-branded type. */
export type Brand<T, B extends string> = T & { readonly __brand: B }

// --- Auxiliary lookup brands ------------------------------------------------
// Secondary-index brands outside the observed/documented split.

/** Single-letter option flag char. Secondary-index brand, not a doc-piece identity. */
export type OptFlag = Brand<string, "OptFlag">

/** Redirection operator token. Secondary-index brand, not a doc-piece identity. */
export type RedirOp = Brand<string, "RedirOp">

export const mkOptFlag = (raw: string): OptFlag => raw.trim() as OptFlag

export const mkRedirOp = (raw: string): RedirOp => raw.trim() as RedirOp

/** Shell-safe redirection slug from a sig (whitespace → `_`). See `RedirDoc.slug`. */
export const redirSlugFromSig = (sig: string): string =>
  sig.replace(/\s+/g, "_")

// --- Parametric observed/documented brands ---------------------------------
//
// Two phantom brands indexed on DocCategory. Distinction is provenance only —
// neither carries corpus-membership proof; that's the resolver layer's job.
//
//   Observed<K>    Normalized K-shaped token from user code / untrusted
//                  source. Produced by `mkObserved` or fact extraction.
//   Documented<K>  Normalized K-shaped identifier that is a key in
//                  `corpus[K]`. Produced by Yodl extractors via
//                  `mkDocumented` and by the resolver layer.
//
// Normalization is shared (one `norm[K]` table); the brand split prevents
// conflating user-code tokens with corpus identities.
//
// Corpus-aware parsing (`NO_AUTO_CD` ≡ `AUTO_CD`, `1>&2` decomposition) lives
// in the per-category resolver layer, not in the smart constructors here.
// See DESIGN.md §"Three phases: raw / observed / documented".

/**
 * Phantom-branded identifier of a documented zsh element for category K.
 * Holding one is a *claim* that the string is a key in `corpus[K]`. Honest
 * acquisition paths:
 *
 * 1. `resolve` — **checked** against the corpus; the path for untrusted input.
 *    Lossy bits (e.g. option `NO_`-stripping) surface via `resolverFeedback`.
 * 2. `mkDocumented(cat, raw)` — **trusted**, no corpus check. Reserved for
 *    corpus construction (Yodl extractors) and test-corpus builders. Misuse
 *    surfaces only as later `Map.get` returning `undefined`.
 *
 * `precmd_modifier` and `process_subst` collapse to their closed literal
 * unions (every valid string is a corpus member); other categories phantom-brand.
 */
export type Documented<K extends DocCategory> = K extends "precmd_modifier"
  ? PrecmdName
  : K extends "process_subst"
    ? ProcessSubstOp
    : string & { readonly __documented: K }

/**
 * Phantom-branded normalized K-shaped token observed in user code (or other
 * untrusted source). NOT a membership proof — only claims category-K
 * normalization. Cross to `Documented<K>` via `resolve(corpus, K, raw)`.
 *
 * `precmd_modifier` / `process_subst` collapse to literal unions, symmetric
 * with `Documented<K>`.
 */
export type Observed<K extends DocCategory> = K extends "precmd_modifier"
  ? PrecmdName
  : K extends "process_subst"
    ? ProcessSubstOp
    : string & { readonly __observed: K }

// Smart constructors (`mkObserved`, `mkDocumented`) live in `brands.ts`;
// `normalizeOptName` in `normalize-option.ts` (mirrored in zshref-rs).

// --- Closed literal unions --------------------------------------------------

export const precmdNames = [
  "-",
  "builtin",
  "command",
  "exec",
  "nocorrect",
  "noglob",
] as const

export type PrecmdName = (typeof precmdNames)[number]

/** zshoptions default-on marker: D=default, K=ksh, S=sh, C=csh, Z=zsh. */
export type DefaultMarker = "D" | "K" | "S" | "C" | "Z"

/** Conditional expression arity (`-a file` vs `f1 -nt f2`). */
export type CondArity = "unary" | "binary"
export type UnaryCondOperands = readonly [string]
export type BinaryCondOperands = readonly [string, string]

export const emulations = ["csh", "ksh", "sh", "zsh"] as const
export type Emulation = (typeof emulations)[number]

export type OptState = "on" | "off"

/** Option-flag sign — zsh convention: `-` enables, `+` disables. */
export type OptFlagSign = "+" | "-"

export const flipOptFlagSign = (sign: OptFlagSign): OptFlagSign =>
  sign === "-" ? "+" : "-"

/** Position where zsh treats the word as reserved. */
export type ReservedWordPos = "command" | "any"

export type HistoryKind = "event-designator" | "word-designator" | "modifier"
export type ProcessSubstOp = "<(...)" | ">(...)" | "=(...)"

/** Short-option alias for a long zsh option. */
export interface OptFlagAlias {
  readonly char: OptFlag
  readonly on: OptFlagSign
}

export const optSections = [
  "Changing Directories",
  "Completion",
  "Expansion and Globbing",
  "History",
  "Initialisation",
  "Input/Output",
  "Job Control",
  "Prompting",
  "Scripts and Functions",
  "Shell Emulation",
  "Shell State",
  "Zle",
  "Option Aliases",
] as const

export type OptSection = (typeof optSections)[number]

/** Parsed zsh option metadata normalized from upstream docs. */
export interface ZshOption {
  readonly name: Documented<"option">
  readonly display: string
  readonly flags: readonly OptFlagAlias[]
  readonly defaultIn: readonly Emulation[]
  readonly category: OptSection
  readonly desc: string
  /** Present on `Option Aliases` entries: the option this alias resolves to, and whether it inverts. */
  readonly aliasOf?: {
    readonly target: Documented<"option">
    readonly negated: boolean
  }
}

/** Parsed unary `[[ ... ]]` conditional operator docs. */
export interface UnaryCondOpDoc {
  readonly op: Documented<"conditional_op">
  readonly operands: UnaryCondOperands
  readonly desc: string
  readonly arity: "unary"
  readonly module?: ModuleName
}

/** Parsed binary `[[ ... ]]` conditional operator docs. */
export interface BinaryCondOpDoc {
  readonly op: Documented<"conditional_op">
  readonly operands: BinaryCondOperands
  readonly desc: string
  readonly arity: "binary"
  readonly module?: ModuleName
}

/** Parsed `[[ ... ]]` conditional operator docs. */
export type CondOpDoc = UnaryCondOpDoc | BinaryCondOpDoc

/**
 * One row in a nested item list inside a builtin/comp-utility body. `sigs`
 * carries every header sharing the row's body — upstream `xitem` chains
 * terminating in `item(...)(body)` fold into one entry, not one per alias.
 */
export interface FlagEntry {
  readonly sigs: NonEmpty<string>
  readonly desc: string
}

/**
 * One sibling nested item list inside a record body. Most records have one
 * group; a few (notably `typeset`, `_arguments`) carry several. `intro` is
 * the prose between the previous group's `enditem()` and this group's
 * `startitem()` — empty for the first group.
 */
export interface FlagGroup {
  readonly intro: string
  readonly flags: readonly FlagEntry[]
}

/** Parsed builtin command doc block. */
export interface BuiltinDoc {
  readonly name: Documented<"builtin">
  readonly synopsis: NonEmpty<string>
  /**
   * Body prose. With `flagGroups`, the intro before the first group; the
   * renderer composes desc → (group intro → flag list)+ → `outro`. Without
   * `flagGroups`, the full body.
   */
  readonly desc: string
  readonly module?: ModuleName
  readonly aliasOf?: Documented<"builtin">
  /** Upstream zsh recommends against new use. */
  readonly deprecated?: boolean
  /** Per-group flags when upstream documents nested item lists inside the body. */
  readonly flagGroups?: readonly FlagGroup[]
  /** Prose after the last flag group. */
  readonly outro?: string
}

/** Parsed precommand modifier doc block. */
export interface PrecmdDoc {
  readonly name: PrecmdName
  readonly synopsis: NonEmpty<string>
  readonly desc: string
}

/** Base interface for syntax-element doc records. */
export interface SyntaxDocBase<Sig extends string = string> {
  /** Usage signature from the upstream zsh manual. */
  readonly sig: Sig
  readonly desc: string
  /** Manual section this element was parsed from. */
  readonly section: string
}

/**
 * Special-parameter scope. Values are internal identifiers, not man-page
 * section titles.
 *
 * - `shell-set`: globals the shell assigns to.
 * - `shell-used`: globals the shell reads.
 * - `zle-widget`: widget-local (BUFFER, CURSOR, ...).
 * - `completion-widget`: completion-widget-local (CURRENT, PREFIX, compstate, ...).
 */
export type ShellParamScope =
  | "shell-set"
  | "shell-used"
  | "zle-widget"
  | "completion-widget"

/**
 * Branded sub-key name inside a `ShellParamDoc.keys` payload (associative-array
 * keys, colon-list enumerated values, ...).
 */
export type ShellParamKeyName = Brand<string, "ShellParamKeyName">

export const mkShellParamKeyName = (raw: string): ShellParamKeyName =>
  raw.trim() as ShellParamKeyName

/**
 * One sub-value under a `ShellParamKey` whose body itself carries a nested
 * item list (e.g. `compstate.context`). No further nesting is captured.
 */
export interface ShellParamKeyValue {
  readonly name: ShellParamKeyName
  readonly desc: string
}

/**
 * One member of `ShellParamDoc.keys`. `desc` is the member's intro prose;
 * `values`, when present, holds an enumerated sub-list (depth-2 from the
 * parameter) rendered as a nested bullet list.
 */
export interface ShellParamKey {
  readonly name: ShellParamKeyName
  readonly desc: string
  readonly values?: readonly ShellParamKeyValue[]
}

/**
 * Special-parameter doc record. Does not extend `SyntaxDocBase`: this category
 * carries a typed `scope` instead of a generic `section: string` prose field.
 *
 * `keys` captures an upstream-documented enumerated nested set (e.g. an
 * associative-array's keys); the renderer composes the visible body from
 * `desc` plus `keys`. See PRINCIPLES.md §"Records are self-contained".
 */
export interface ShellParamDoc {
  readonly name: Documented<"special_param">
  /**
   * Body prose. With `keys`, the intro before the key list; the renderer
   * composes intro → key headings → `outro`. Without `keys`, the full body.
   */
  readonly sig: string
  readonly desc: string
  readonly scope: ShellParamScope
  readonly tied?: Documented<"special_param">
  readonly keys?: readonly ShellParamKey[]
  /** Prose after the key list. */
  readonly outro?: string
  readonly module?: ModuleName
}

/**
 * Reserved word.
 *
 * `desc` is optional (hence no `SyntaxDocBase` extension). Heads covered by
 * `complex_command` (`for`, `while`, `[[`, ...) omit it — a generic "this is a
 * reserved word" string would be an epistemic trap, drawing agents to the
 * cheapest record when the richer one lives elsewhere. Body words (`do`,
 * `then`, ...) and standalones (`!`, `coproc`, typeset family) keep enriched
 * per-word prose.
 */
export interface ReservedWordDoc {
  readonly name: Documented<"reserved_word">
  readonly pos: ReservedWordPos
  readonly sig: string
  readonly section: string
  readonly desc?: string
}

/** One alternate-form synopsis attached to a `ComplexCommandDoc`. */
export interface AlternateForm {
  /** Canonical signature of the alternate form, in code shape. */
  readonly template: string
  /** Keyword-position tt tokens within the alternate-form synopsis. */
  readonly keywords: readonly string[]
  /**
   * Shell options that gate this form — **disjunctive**: enabling any one
   * activates the form (e.g. `["SHORT_LOOPS", "SHORT_REPEAT"]` for `repeat`).
   * Absent when the form is always available.
   */
  readonly requires?: NonEmpty<string>
}

/**
 * Complex command — `grammar.yo` "Complex Commands" section plus matching
 * "Alternate Forms for Complex Commands" entries.
 *
 * Overlap with `reserved_word` on head keywords (`for`, `if`, `while`, ...,
 * `[[`, `{`, `time`) is deliberate; `classifyOrder` places this category
 * first. See PRINCIPLES.md §"Overlap between categories is accepted".
 */
export interface ComplexCommandDoc extends SyntaxDocBase {
  readonly name: Documented<"complex_command">
  /** Alternate synopses; may be empty. */
  readonly alternateForms: readonly AlternateForm[]
  /** Body-position tt tokens in the canonical synopsis (`do`, `done`, `esac`, ...). */
  readonly bodyKeywords: readonly string[]
}

export interface RedirDoc extends SyntaxDocBase {
  /**
   * Shell-safe identity. Derived from `sig` by replacing spaces with `_`
   * (`"> word"` → `">_word"`, `"<<[-] word"` → `"<<[-]_word"`).
   */
  readonly slug: Documented<"redirection">
  /** Human-readable signature; not the identity. */
  readonly sig: string
  /** Grouping token; multiple redirection docs share a `groupOp`. */
  readonly groupOp: RedirOp
}

/** Process substitution -- `<(...)` and `>(...)`. */
export interface ProcessSubstDoc extends SyntaxDocBase {
  readonly op: ProcessSubstOp
}

/**
 * Semantic kind of a parameter-expansion form. One literal per logical
 * operation; sigs differing only in null-check (`-` vs `:-`), match scope
 * (`#` vs `##`), or similar collapse to one subKind, distinguished at the
 * record level by the sig itself.
 */
export type ParamExpnSubKind =
  | "plain"
  | "set-test"
  | "default"
  | "alt"
  | "assign"
  | "err"
  | "strip-pre"
  | "strip-suf"
  | "exclude"
  | "array-remove"
  | "array-retain"
  | "array-zip"
  | "substring"
  | "replace"
  | "length"
  | "rc-expand"
  | "word-split"
  | "glob-subst"

/**
 * Parameter-expansion form (`${name:-word}`, `${name/pattern/repl}`, ...).
 *
 * One record per sig. Sigs sharing an upstream doc chunk (e.g. the three
 * `replace` variants) carry identical `desc`; each record knows its siblings
 * via `groupSigs` (manual source order) and its own position via `orderInGroup`.
 */
export interface ParamExpnDoc extends SyntaxDocBase<Documented<"param_expn">> {
  readonly sig: Documented<"param_expn">
  /** Every sig sharing this record's desc, in manual source order. */
  readonly groupSigs: NonEmpty<string>
  /** Zero-based position of `sig` within `groupSigs`. */
  readonly orderInGroup: number
  readonly subKind: ParamExpnSubKind
  /** Named operand slots in `sig` (`["name","word"]`, ...). */
  readonly placeholders: readonly string[]
}

/** Subscript flags -- e.g. `(e)`, `(w)` inside `${arr[(...)...]}`. */
export interface SubscriptFlagDoc extends SyntaxDocBase {
  readonly flag: Documented<"subscript_flag">
  readonly args: readonly string[]
}

/** Parameter-expansion flags -- e.g. `(U)`, `(L)` inside `${(...)var}`. */
export interface ParamFlagDoc extends SyntaxDocBase {
  readonly flag: Documented<"param_expn_flag">
  readonly args: readonly string[]
}

export interface HistoryDoc extends SyntaxDocBase {
  readonly key: Documented<"history_expn">
  readonly kind: HistoryKind
}

export type GlobOpKind = "standard" | "ksh-like"

/**
 * Globbing operators (`*`, `?`, `[...]`, ...).
 *
 * No `requires` field: `ksh-like` depends on `KSH_GLOB`, but a structured
 * hint would invite an expectation the corpus can't meet generally — many
 * forms depend on shell state we don't model. `kind` is the discriminator;
 * option-dependency lookup stays in rendered prose.
 */
export interface GlobOpDoc extends SyntaxDocBase {
  readonly op: Documented<"glob_op">
  readonly kind: GlobOpKind
}

/** Glob flags (`(#i)`, `(#b)`, ...) — in-pattern. */
export interface GlobFlagDoc extends SyntaxDocBase {
  readonly flag: Documented<"glob_flag">
  readonly args: readonly string[]
}

/**
 * Glob qualifiers — pattern-trailing single-letter flags under
 * `BARE_GLOB_QUAL` / `EXTENDED_GLOB` (`*(.)`, `*(/)`, `*(#q@)`, ...). Distinct
 * from `glob_op` (in-pattern) and `glob_flag` (in-pattern `(#...)`): qualifiers
 * trail the pattern and filter the match list.
 */
export interface GlobQualifierDoc extends SyntaxDocBase {
  readonly flag: Documented<"glob_qualifier">
  readonly args: readonly string[]
}

export const promptSubsections = [
  "Special characters",
  "Login information",
  "Shell state",
  "Date and time",
  "Visual effects",
  "Conditional Substrings in Prompts",
] as const

export type PromptSubsection = (typeof promptSubsections)[number]

/** Prompt-expansion escape sequences -- e.g. `%n`, `%~`, `%D{string}`, `%F{color}`. */
export interface PromptEscapeDoc extends SyntaxDocBase {
  readonly key: Documented<"prompt_escape">
  readonly section: PromptSubsection
}

export const zleWidgetSubsections = [
  "Movement",
  "History Control",
  "Modifying Text",
  "Arguments",
  "Completion",
  "Miscellaneous",
  "Text Objects",
  "Special Widgets",
] as const

export type ZleWidgetSubsection = (typeof zleWidgetSubsections)[number]

export type ZleWidgetKind = "standard" | "special"

/**
 * One nested entry within a ZLE widget's body (e.g. inside
 * `history-incremental-search-backward`'s mini-buffer support list). `sig` is
 * the normalized full header with `xitem` aliases folded in.
 */
export interface ZleWidgetSubItem {
  readonly sig: string
  readonly desc: string
}

/** ZLE widget — standard and special widgets from `zle.yo`. */
export interface ZleWidgetDoc extends SyntaxDocBase {
  readonly name: Documented<"zle_widget">
  /** `"standard"` for bindable editing widgets; `"special"` for shell-called hooks. */
  readonly kind: ZleWidgetKind
  readonly section: ZleWidgetSubsection
  /**
   * Nested item list inside the widget body (currently just
   * `history-incremental-search-backward`). When present, `desc` is the
   * intro; renderer composes intro → sub-items → `outro`.
   */
  readonly subItems?: readonly ZleWidgetSubItem[]
  /** Prose after the sub-item list. */
  readonly outro?: string
  readonly module?: ModuleName
}

/**
 * ZLE keymap — one of the fixed initial keymaps (`emacs`, `viins`, `vicmd`,
 * `viopp`, `visual`, `isearch`, `command`, `.safe`).
 *
 * `main` is not a keymap, but an alias to `emacs`/`viins` depending on
 * `$VISUAL`/`$EDITOR`; tracked via `linkedFrom` on the default target (emacs).
 */
export interface KeymapDoc extends SyntaxDocBase {
  readonly name: Documented<"keymap">
  /** `.safe` is special — immutable and always present. */
  readonly isSpecial: boolean
  /** Aliases onto this keymap (e.g. `main` onto `emacs`). */
  readonly linkedFrom: readonly string[]
}

/** Zsh job-spec forms -- `%number`, `%string`, `%?string`, `%%`, `%+`, `%-`. */
export type JobSpecKind =
  | "number"
  | "string"
  | "contains"
  | "current"
  | "previous"

export interface JobSpecDoc extends SyntaxDocBase {
  readonly key: Documented<"job_spec">
  readonly kind: JobSpecKind
}

/** Arithmetic operator arity; `overloaded` = same op as both unary and binary (`+`, `-`). */
export type ArithOpArity = "unary" | "binary" | "ternary" | "overloaded"

/** Arithmetic operator — one record per op from `arith.yo`'s native-precedence table. */
export interface ArithOpDoc extends SyntaxDocBase {
  readonly op: Documented<"arith_op">
  readonly arity: ArithOpArity
}

/**
 * Special-function kind.
 *
 * - `hook`: companion-array callback (chpwd, periodic, precmd, preexec, zshaddhistory, zshexit).
 * - `trap-literal`: specifically named trap (TRAPDEBUG, TRAPEXIT, TRAPZERR, TRAPERR).
 * - `trap-template`: `TRAPNAL` template where NAL is any signal name (`man 7 signal`).
 */
export type SpecialFunctionKind = "hook" | "trap-literal" | "trap-template"

/** Special function — hooks and TRAP* from `func.yo` §Special Functions. */
export interface SpecialFunctionDoc extends SyntaxDocBase {
  readonly name: Documented<"special_function">
  readonly kind: SpecialFunctionKind
  /** Hook's companion `${name}_functions` array name. Absent on TRAP*. */
  readonly hookArray?: string
}

/**
 * Completion utility — `compsys.yo` §"Utility Functions"
 * (`_absolute_command_paths`, `_all_labels`, `_arguments`, ...).
 *
 * `desc` / `flagGroups` / `outro` mirror `BuiltinDoc`. `sig` is the canonical
 * first synopsis line; `synopsis` carries every synopsis line with upstream
 * `SPACES()` continuations folded onto the preceding line — rendered as a
 * multi-line code block.
 */
export interface CompUtilityDoc extends SyntaxDocBase {
  readonly name: Documented<"comp_utility">
  readonly synopsis: NonEmpty<string>
  /** Per-group flags; same posture as `BuiltinDoc.flagGroups`. */
  readonly flagGroups?: readonly FlagGroup[]
  /** Prose after the last flag group. */
  readonly outro?: string
}

/**
 * Math function from `zsh/mathfunc` — callable in arithmetic expressions
 * (`$(( cos(0) ))`). `module` is always set: mathfuncs only exist inside
 * modules. `sig` mirrors `BuiltinDoc.synopsis` — multi-line rendered.
 */
export interface MathfuncDoc {
  readonly name: Documented<"mathfunc">
  /** Call signature(s) — multiple forms render as separate lines. */
  readonly sig: NonEmpty<string>
  readonly desc: string
  readonly module: ModuleName
}
