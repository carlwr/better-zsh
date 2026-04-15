import type { NonEmpty } from "@carlwr/typescript-extra"

import type { DocCategory } from "./taxonomy.ts"

/** Phantom-branded type for nominal-ish typing with zero runtime cost. */
export type Brand<T, B extends string> = T & { readonly __brand: B }

// --- Auxiliary lookup brands ------------------------------------------------
// Outside the candidate/proven split; used as secondary-index brands.

/** Single-letter option flag char. Well-formed; secondary index brand, not a doc-piece identity. */
export type OptFlag = Brand<string, "OptFlag">

/** Redirection operator token. Well-formed; secondary index brand, not a doc-piece identity. */
export type RedirOp = Brand<string, "RedirOp">

export const mkOptFlag = (raw: string): OptFlag => raw.trim() as OptFlag

export const mkRedirOp = (raw: string): RedirOp => raw.trim() as RedirOp

// --- Parametric proven/candidate brands -------------------------------------

// The Proven/Candidate split is primarily about PROVENANCE, not normalization:
//   Candidate<K> = "from user code / untrusted source; membership unknown"
//   Proven<K>    = "known to identify a documented corpus element"
//
// `resolve()` is the sole public crossing point and operationalizes the split
// at the value level (Map.has → `| undefined`). Holding a `Proven<K>` is proof
// of corpus membership; holding a `Candidate<K>` is only well-formedness.
//
// Secondary observation: most categories share the same normalization between
// the two sides (trim). One category — `option` — has asymmetric normalization
// (candidate strips a leading `no_` negation prefix; proven does not), because
// `setopt no_autocd` references the same option doc as `setopt AUTO_CD`. The
// asymmetry is what makes the split catch bugs materially (not only flag
// provenance) for `option`; for other categories the brand is a type-only
// provenance marker.

/**
 * Phantom-branded identifier of a KNOWN documented zsh element for category K.
 * Provenance: produced by corpus construction (Yodl extractors) or by
 * `resolve()` — never directly from user code. Holding a `Proven<K>` is a
 * static proof of corpus membership.
 *
 * `precmd` and `process_subst` use closed literal unions (every valid string
 * is a corpus member); all other categories use phantom brands.
 */
export type Proven<K extends DocCategory> = K extends "precmd"
  ? PrecmdName
  : K extends "process_subst"
    ? ProcessSubstOp
    : string & { readonly __proven: K }

/**
 * Phantom-branded well-formed lookup candidate for category K, derived from
 * user code or other untrusted sources. Provenance: produced by consumers via
 * `mkCandidate`. A candidate MIGHT identify a corpus element; it is not a
 * membership proof. Crossing to `Proven<K>` happens only through `resolve()`.
 */
export type Candidate<K extends DocCategory> = string & {
  readonly __candidate: K
}

// Normalization tables for proven and candidate smart constructors.
// idempotent; strips underscores, lowercases
export function normalizeOptName(raw: string): string {
  return raw.replace(/_/g, "").toLowerCase()
}

const provenNorm: { [K in DocCategory]: (s: string) => string } = {
  option: normalizeOptName,
  cond_op: s => s.trim(),
  builtin: s => s.trim(),
  precmd: s => s.trim(),
  shell_param: s => s.trim(),
  reserved_word: s => s.trim(),
  redir: s => s.trim(),
  process_subst: s => s.trim(),
  subscript_flag: s => s.trim(),
  param_flag: s => s.trim(),
  history: s => s.trim(),
  glob_op: s => s.trim(),
  glob_flag: s => s.trim(),
}

const candidateNorm: { [K in DocCategory]: (s: string) => string } = {
  option: s => normalizeOptName(s.replace(/^no_?/i, "")),
  cond_op: s => s.trim(),
  builtin: s => s.trim(),
  precmd: s => s.trim(),
  shell_param: s => s.trim(),
  reserved_word: s => s.trim(),
  redir: s => s.trim(),
  process_subst: s => s.trim(),
  subscript_flag: s => s.trim(),
  param_flag: s => s.trim(),
  history: s => s.trim(),
  glob_op: s => s.trim(),
  glob_flag: s => s.trim(),
}

/**
 * Smart constructor for a proven corpus-identity brand. Normalizes `raw`
 * per-category and casts to `Proven<K>`. Used by Yodl extractors.
 */
export const mkProven = <K extends DocCategory>(
  cat: K,
  raw: string,
): Proven<K> => provenNorm[cat](raw) as Proven<K>

/**
 * Smart constructor for a candidate lookup brand. Normalizes `raw` per-category
 * (option: additionally strips leading `no`/`no_` prefix; others: trim) and
 * casts to `Candidate<K>`.
 */
export const mkCandidate = <K extends DocCategory>(
  cat: K,
  raw: string,
): Candidate<K> => candidateNorm[cat](raw) as Candidate<K>

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
  readonly name: Proven<"option">
  readonly display: string
  readonly flags: readonly OptFlagAlias[]
  readonly defaultIn: readonly Emulation[]
  readonly category: OptSection
  readonly desc: string
}

/** Parsed unary `[[ ... ]]` conditional operator docs. */
export interface UnaryCondOpDoc {
  readonly op: Proven<"cond_op">
  readonly operands: UnaryCondOperands
  readonly desc: string
  readonly arity: "unary"
}

/** Parsed binary `[[ ... ]]` conditional operator docs. */
export interface BinaryCondOpDoc {
  readonly op: Proven<"cond_op">
  readonly operands: BinaryCondOperands
  readonly desc: string
  readonly arity: "binary"
}

/** Parsed `[[ ... ]]` conditional operator docs. */
export type CondOpDoc = UnaryCondOpDoc | BinaryCondOpDoc

/** Parsed builtin command doc block. */
export interface BuiltinDoc {
  readonly name: Proven<"builtin">
  readonly synopsis: NonEmpty<string>
  readonly desc: string
  /** present when builtin requires a loaded module */
  readonly module?: string
  /** present when this is an alias of another builtin */
  readonly aliasOf?: Proven<"builtin">
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
  readonly name: Proven<"shell_param">
  readonly tied?: Proven<"shell_param">
}

export interface ReservedWordDoc extends SyntaxDocBase {
  readonly name: Proven<"reserved_word">
  readonly pos: ReservedWordPos
}

export interface RedirDoc extends SyntaxDocBase<Proven<"redir">> {
  /** Full signature is the doc identity; `groupOp` is only the shared lookup bucket. */
  readonly sig: Proven<"redir">
  /** Grouping token only; multiple redirection docs share the same `groupOp`. */
  readonly groupOp: RedirOp
}

/** Process substitution -- `<(...)` and `>(...)`. */
export interface ProcessSubstDoc extends SyntaxDocBase {
  readonly op: ProcessSubstOp
}

/** Subscript flags -- e.g. `(e)`, `(w)` inside `${arr[(...)...]}`. */
export interface SubscriptFlagDoc extends SyntaxDocBase {
  readonly flag: Proven<"subscript_flag">
  readonly args: readonly string[]
}

/** Parameter-expansion flags -- e.g. `(U)`, `(L)` inside `${(...)var}`. */
export interface ParamFlagDoc extends SyntaxDocBase {
  readonly flag: Proven<"param_flag">
  readonly args: readonly string[]
}

export interface HistoryDoc extends SyntaxDocBase {
  readonly key: Proven<"history">
  readonly kind: HistoryKind
}

/** Globbing operators -- e.g. `*`, `?`, `[...]`. */
export interface GlobOpDoc extends SyntaxDocBase {
  readonly op: Proven<"glob_op">
}

/** Glob flags -- e.g. `(#i)`, `(#b)` inside glob patterns. */
export interface GlobFlagDoc extends SyntaxDocBase {
  readonly flag: Proven<"glob_flag">
  readonly args: readonly string[]
}
