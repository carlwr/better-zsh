import type { BuiltinName, CondOp, OptFlagChar, OptName } from "./brand.ts"

export { type PrecmdName, precmdNames } from "./precmd.ts"

import type { PrecmdName } from "./precmd.ts"

/** Default-on marker from zshoptions: <D>=default, <K>=ksh, <S>=sh, <C>=csh, <Z>=zsh */
export type DefaultMarker = "D" | "K" | "S" | "C" | "Z"

/** Conditional expression: unary (-a file) vs binary (f1 -nt f2) */
export type CondArity = "unary" | "binary"

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
  char: OptFlagChar
  on: OptFlagSign
}

/** Parsed zsh option metadata normalized from upstream docs. */
export interface ZshOption {
  name: OptName
  display: string
  flags: readonly OptFlagAlias[]
  defaultIn: readonly Emulation[]
  category: string
  desc: string
}

/** Parsed unary `[[ ... ]]` conditional operator docs. */
export interface UnaryCondOpDoc {
  op: CondOp
  operands: readonly [string]
  desc: string
  arity: "unary"
}

/** Parsed binary `[[ ... ]]` conditional operator docs. */
export interface BinaryCondOpDoc {
  op: CondOp
  operands: readonly [string, string]
  desc: string
  arity: "binary"
}

/** Parsed `[[ ... ]]` conditional operator docs. */
export type CondOpDoc = UnaryCondOpDoc | BinaryCondOpDoc

/** Parsed builtin command doc block. */
export interface BuiltinDoc {
  name: BuiltinName
  synopsis: readonly string[]
  desc: string
  /** present when builtin requires a loaded module */
  module?: string
  /** present when this is an alias of another builtin */
  aliasOf?: BuiltinName
}

/** Parsed precommand modifier doc block. */
export interface PrecmdDoc {
  name: PrecmdName
  synopsis: readonly string[]
  desc: string
}

/** Base interface for syntax-element doc records parsed from upstream Yodl sources. */
export interface SyntaxDocBase {
  /** Usage signature from the upstream zsh manual. */
  sig: string
  desc: string
  /** Manual section this element was parsed from. */
  section: string
}

/** Shell-managed parameters documented in `zshparam`. */
export interface ShellParamDoc extends SyntaxDocBase {
  name: string
  tied?: string
}

export interface ReservedWordDoc extends SyntaxDocBase {
  name: string
  pos: ReservedWordPos
}

export interface RedirDoc extends SyntaxDocBase {
  op: string
}

/** Process substitution -- `<(...)` and `>(...)`. */
export interface ProcessSubstDoc extends SyntaxDocBase {
  op: ProcessSubstOp
}

/** Subscript flags -- e.g. `(e)`, `(w)` inside `${arr[(...)...]}`. */
export interface SubscriptFlagDoc extends SyntaxDocBase {
  flag: string
  args: readonly string[]
}

/** Parameter-expansion flags -- e.g. `(U)`, `(L)` inside `${(...)var}`. */
export interface ParamFlagDoc extends SyntaxDocBase {
  flag: string
  args: readonly string[]
}

export interface HistoryDoc extends SyntaxDocBase {
  key: string
  kind: HistoryKind
}

/** Globbing operators -- e.g. `*`, `?`, `[...]`. */
export interface GlobOpDoc extends SyntaxDocBase {
  op: string
}

/** Globbing flags -- e.g. `(#i)`, `(#b)` inside glob patterns. */
export interface GlobbingFlagDoc extends SyntaxDocBase {
  flag: string
  args: readonly string[]
}
