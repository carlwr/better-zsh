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

export interface ReservedWordDoc extends SyntaxDocBase {
  readonly name: Documented<"reserved_word">
  readonly pos: ReservedWordPos
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

/** Globbing operators -- e.g. `*`, `?`, `[...]`. */
export interface GlobOpDoc extends SyntaxDocBase {
  readonly op: Documented<"glob_op">
}

/** Glob flags -- e.g. `(#i)`, `(#b)` inside glob patterns. */
export interface GlobFlagDoc extends SyntaxDocBase {
  readonly flag: Documented<"glob_flag">
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
