import type { NonEmpty } from "@carlwr/typescript-extra"

import type { DocCategory } from "./taxonomy.ts"

/** Phantom-branded type for nominal-ish typing with zero runtime cost. */
export type Brand<T, B extends string> = T & { readonly __brand: B }

// --- Auxiliary lookup brands ------------------------------------------------
// Outside the observed/documented split; used as secondary-index brands.

/** Single-letter option flag char. Well-formed; secondary index brand, not a doc-piece identity. */
export type OptFlag = Brand<string, "OptFlag">

/** Redirection operator token. Well-formed; secondary index brand, not a doc-piece identity. */
export type RedirOp = Brand<string, "RedirOp">

export const mkOptFlag = (raw: string): OptFlag => raw.trim() as OptFlag

export const mkRedirOp = (raw: string): RedirOp => raw.trim() as RedirOp

// --- Parametric observed/documented brands ---------------------------------
//
// Two phantom brands, both indexed on DocCategory. The distinction is PURELY
// provenance at this layer — neither brand carries corpus-membership proof on
// its own; that's what the resolver layer does.
//
//   Observed<K>    "a normalized, well-formed K-shaped token I observed in
//                   user code or other untrusted source". Produced by
//                   `mkObserved` or by fact extraction.
//
//   Documented<K>  "a normalized, well-formed K-shaped identifier that is a
//                   key in `corpus[K]`". Produced by Yodl extractors via
//                   `mkDocumented` and by the resolver layer.
//
// The normalization policy is identical for Observed<K> and Documented<K>
// (one `norm[K]` table). The brand split exists so the type system refuses to
// confuse user-code tokens with corpus identities.
//
// Corpus-aware parse concerns (e.g. `setopt NO_AUTO_CD` referring to the same
// option as `setopt AUTO_CD`, or a redirection token like `1>&2` decomposing
// into a group operator + tail) do NOT live in the smart constructors here —
// they live in the per-category resolver table in `corpus.ts`. See DESIGN.md,
// "Three phases: raw / observed / documented".

/**
 * Phantom-branded identifier of a documented zsh element for category K.
 * Holding a `Documented<K>` expresses the *claim* "this string is a key in
 * `corpus[K]`." Two ways to obtain one honestly:
 *
 * 1. The resolver layer (`resolve`, `resolveOption`) — **checked**: membership
 *    is verified against the corpus. This is the path for untrusted input.
 * 2. `mkDocumented(cat, raw)` — **trusted**: no corpus check. Intended for
 *    corpus construction (Yodl extractors) and test-corpus builders, where the
 *    caller vouches for membership. Misuse is detectable only indirectly
 *    (subsequent `Map.get` returning `undefined`).
 *
 * `precmd` and `process_subst` collapse via conditional type to their closed
 * literal unions (every valid string is a corpus member); all other categories
 * use phantom brands.
 */
export type Documented<K extends DocCategory> = K extends "precmd"
  ? PrecmdName
  : K extends "process_subst"
    ? ProcessSubstOp
    : string & { readonly __documented: K }

/**
 * Phantom-branded well-formed, normalized K-shaped token observed in user
 * code (or other untrusted source). An `Observed<K>` is NOT a membership
 * proof — it only claims that the string has been normalized per category K's
 * policy. The boundary crossing to `Documented<K>` is `resolve(corpus, K,
 * raw)`, which applies category-specific corpus-aware parsing.
 *
 * `precmd` and `process_subst` resolve to their literal unions (symmetric with
 * `Documented<K>`).
 */
export type Observed<K extends DocCategory> = K extends "precmd"
  ? PrecmdName
  : K extends "process_subst"
    ? ProcessSubstOp
    : string & { readonly __observed: K }

// Brand-minting smart constructors (`mkObserved`, `mkDocumented`) and
// `normalizeOptName` live in `brands.ts` — co-located with the shared
// per-category normalization table they depend on.

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

/** Default-on marker from zshoptions: <D>=default, <K>=ksh, <S>=sh, <C>=csh, <Z>=zsh */
export type DefaultMarker = "D" | "K" | "S" | "C" | "Z"

/** Conditional expression: unary (-a file) vs binary (f1 -nt f2) */
export type CondArity = "unary" | "binary"
export type UnaryCondOperands = readonly [string]
export type BinaryCondOperands = readonly [string, string]

export type Emulation = "csh" | "ksh" | "sh" | "zsh"

export type OptState = "on" | "off"

/** Sign of an option flag: `-` turns the option on, `+` turns it off (zsh convention). */
export type OptFlagSign = "+" | "-"

/** Where zsh recognizes the word as reserved, not just as an ordinary word. */
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
}

/** Parsed unary `[[ ... ]]` conditional operator docs. */
export interface UnaryCondOpDoc {
  readonly op: Documented<"cond_op">
  readonly operands: UnaryCondOperands
  readonly desc: string
  readonly arity: "unary"
}

/** Parsed binary `[[ ... ]]` conditional operator docs. */
export interface BinaryCondOpDoc {
  readonly op: Documented<"cond_op">
  readonly operands: BinaryCondOperands
  readonly desc: string
  readonly arity: "binary"
}

/** Parsed `[[ ... ]]` conditional operator docs. */
export type CondOpDoc = UnaryCondOpDoc | BinaryCondOpDoc

/** Parsed builtin command doc block. */
export interface BuiltinDoc {
  readonly name: Documented<"builtin">
  readonly synopsis: NonEmpty<string>
  readonly desc: string
  /** present when builtin requires a loaded module */
  readonly module?: string
  /** present when this is an alias of another builtin */
  readonly aliasOf?: Documented<"builtin">
}

/** Parsed precommand modifier doc block. */
export interface PrecmdDoc {
  readonly name: PrecmdName
  readonly synopsis: NonEmpty<string>
  readonly desc: string
}

/** Base interface for syntax-element doc records parsed from upstream Yodl sources. */
export interface SyntaxDocBase<Sig extends string = string> {
  /** Usage signature from the upstream zsh manual. */
  readonly sig: Sig
  readonly desc: string
  /** Manual section this element was parsed from. */
  readonly section: string
}

/** Shell-managed parameters documented in `zshparam`. */
export interface ShellParamDoc extends SyntaxDocBase {
  readonly name: Documented<"shell_param">
  readonly tied?: Documented<"shell_param">
}

/**
 * Reserved word.
 *
 * `desc` is optional (deliberately unlike other `SyntaxDocBase`-shaped records,
 * which is why `ReservedWordDoc` does not extend `SyntaxDocBase`). Heads
 * covered by `complex_command` (e.g. `for`, `while`, `[[`) omit it entirely
 * — a fixed generic "this is a reserved word" string would be an epistemic
 * trap, pushing agents toward the cheapest record when the richer one lives
 * elsewhere. Body words (`do`, `then`, …) and standalone entries (`!`,
 * `coproc`, typeset family) keep enriched per-word prose.
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
  /** Optional shell-option dependency noted by the manual, e.g. `SHORT_LOOPS`. */
  readonly requires?: string
}

/**
 * Complex command -- zsh's structured control-flow constructs from
 * `grammar.yo`'s "Complex Commands" section, augmented with any matching
 * entries from "Alternate Forms for Complex Commands".
 *
 * Overlap with `reserved_word` on head keywords (`for`, `if`, `while`, ...)
 * and `[[`, `{`, `time` is deliberate. `classifyOrder` places
 * `complex_command` before `reserved_word`: a raw `for` classifies as the
 * structured doc, not the reserved-word boilerplate. See PRINCIPLES.md
 * §"Overlap between categories is accepted".
 */
export interface ComplexCommandDoc extends SyntaxDocBase {
  readonly name: Documented<"complex_command">
  /** Alternate synopses the manual lists for this head keyword; may be empty. */
  readonly alternateForms: readonly AlternateForm[]
  /** Body-position tt tokens in the canonical synopsis (e.g. `do`, `done`, `esac`). */
  readonly bodyKeywords: readonly string[]
}

export interface RedirDoc extends SyntaxDocBase<Documented<"redir">> {
  /** Full signature is the doc identity; `groupOp` is only the shared lookup bucket. */
  readonly sig: Documented<"redir">
  /** Grouping token only; multiple redirection docs share the same `groupOp`. */
  readonly groupOp: RedirOp
}

/** Process substitution -- `<(...)` and `>(...)`. */
export interface ProcessSubstDoc extends SyntaxDocBase {
  readonly op: ProcessSubstOp
}

/**
 * Semantic kind of a parameter-expansion form.
 *
 * One literal per logical operation; sigs that differ only in "null-check"
 * (`-` vs `:-`), match-scope (`#` vs `##`), or similar scope modifiers
 * collapse to the same subKind and are distinguished at the record level by
 * the sig itself.
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
 * Parameter-expansion form -- e.g. `${name:-word}`, `${name/pattern/repl}`.
 *
 * One record per sig. Related sigs that share a doc chunk in the upstream
 * manual (e.g. the three `replace` variants) carry identical `desc`; each
 * record also knows every sibling in its group via `groupSigs` (manual source
 * order) and its own position via `orderInGroup`. This mirrors the "full sig
 * is the identity" precedent from `RedirDoc`.
 */
export interface ParamExpnDoc extends SyntaxDocBase<Documented<"param_expn">> {
  readonly sig: Documented<"param_expn">
  /** Every sig sharing this record's desc, in manual source order. */
  readonly groupSigs: NonEmpty<string>
  /** Zero-based position of `sig` within `groupSigs`. */
  readonly orderInGroup: number
  readonly subKind: ParamExpnSubKind
  /** Named operand slots in `sig` (e.g. `["name","word"]`). */
  readonly placeholders: readonly string[]
}

/** Subscript flags -- e.g. `(e)`, `(w)` inside `${arr[(...)...]}`. */
export interface SubscriptFlagDoc extends SyntaxDocBase {
  readonly flag: Documented<"subscript_flag">
  readonly args: readonly string[]
}

/** Parameter-expansion flags -- e.g. `(U)`, `(L)` inside `${(...)var}`. */
export interface ParamFlagDoc extends SyntaxDocBase {
  readonly flag: Documented<"param_flag">
  readonly args: readonly string[]
}

export interface HistoryDoc extends SyntaxDocBase {
  readonly key: Documented<"history">
  readonly kind: HistoryKind
}

export type GlobOpKind = "standard" | "ksh-like"

/**
 * Globbing operators -- e.g. `*`, `?`, `[...]`.
 *
 * No `requires` field by design: `ksh-like` operators depend on `KSH_GLOB`,
 * but surfacing that as a structured hint would invite a wider expectation
 * ("zshref tells me when anything requires an option") that the corpus can't
 * meet generally — many forms depend on shell state we don't model. The
 * `kind` discriminator is what consumers have; option-dependency lookup is
 * left to the rendered prose.
 */
export interface GlobOpDoc extends SyntaxDocBase {
  readonly op: Documented<"glob_op">
  readonly kind: GlobOpKind
}

/** Glob flags -- e.g. `(#i)`, `(#b)` inside glob patterns. */
export interface GlobFlagDoc extends SyntaxDocBase {
  readonly flag: Documented<"glob_flag">
  readonly args: readonly string[]
}

/**
 * Glob qualifiers -- pattern-trailer single-letter flags used with
 * `BARE_GLOB_QUAL` / `EXTENDED_GLOB`, e.g. `*(.)`, `*(/)`, `*(#q@)`. Distinct
 * syntactic category from `glob_op` (in-pattern) and `glob_flag` (in-pattern
 * `(#...)`): qualifiers are the trailing parenthesised form that filters the
 * match list after globbing.
 */
export interface GlobQualifierDoc extends SyntaxDocBase {
  readonly flag: Documented<"glob_qualifier">
  readonly args: readonly string[]
}

/** Prompt-expansion escape sequences -- e.g. `%n`, `%~`, `%D{string}`, `%F{color}`. */
export interface PromptEscapeDoc extends SyntaxDocBase {
  readonly key: Documented<"prompt_escape">
}

/** Zsh Line Editor widget names -- standard and special widgets from `zle.yo`. */
export interface ZleWidgetDoc extends SyntaxDocBase {
  readonly name: Documented<"zle_widget">
  /** `"standard"` for bindable editing widgets; `"special"` for shell-called hooks. */
  readonly kind: ZleWidgetKind
}

export type ZleWidgetKind = "standard" | "special"
