import type { NonEmpty } from "@carlwr/typescript-extra"
import type {
  BuiltinName,
  CondOp,
  GlobbingFlag,
  GlobOp,
  HistoryKey,
  OptFlagChar,
  OptName,
  ParamFlag,
  RedirOp,
  ShellParamName,
  SubscriptFlag,
} from "./brand.ts"

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

export const optionCategories = [
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

export type OptionCategory = (typeof optionCategories)[number]

/** Short-option alias for a long zsh option. */
export interface OptFlagAlias {
  readonly char: OptFlagChar
  readonly on: OptFlagSign
}

/** Parsed zsh option metadata normalized from upstream docs. */
export interface ZshOption {
  readonly name: OptName
  readonly display: string
  readonly flags: readonly Readonly<OptFlagAlias>[]
  readonly defaultIn: readonly Emulation[]
  readonly category: OptionCategory
  readonly desc: string
}

/** Parsed unary `[[ ... ]]` conditional operator docs. */
export interface UnaryCondOpDoc {
  readonly op: CondOp
  readonly operands: readonly [string]
  readonly desc: string
  readonly arity: "unary"
}

/** Parsed binary `[[ ... ]]` conditional operator docs. */
export interface BinaryCondOpDoc {
  readonly op: CondOp
  readonly operands: readonly [string, string]
  readonly desc: string
  readonly arity: "binary"
}

/** Parsed `[[ ... ]]` conditional operator docs. */
export type CondOpDoc = UnaryCondOpDoc | BinaryCondOpDoc

/** Parsed builtin command doc block. */
export interface BuiltinDoc {
  readonly name: BuiltinName
  readonly synopsis: NonEmpty<string>
  readonly desc: string
  /** present when builtin requires a loaded module */
  readonly module?: string
  /** present when this is an alias of another builtin */
  readonly aliasOf?: BuiltinName
}

/** Parsed precommand modifier doc block. */
export interface PrecmdDoc {
  readonly name: PrecmdName
  readonly synopsis: NonEmpty<string>
  readonly desc: string
}

/** Base interface for syntax-element doc records parsed from upstream Yodl sources. */
export interface SyntaxDocBase {
  /** Usage signature from the upstream zsh manual. */
  readonly sig: string
  readonly desc: string
  /** Manual section this element was parsed from. */
  readonly section: string
}

/** Shell-managed parameters documented in `zshparam`. */
export interface ShellParamDoc extends SyntaxDocBase {
  readonly name: ShellParamName
  readonly tied?: ShellParamName
}

export interface ReservedWordDoc extends SyntaxDocBase {
  readonly name: string
  readonly pos: ReservedWordPos
}

export interface RedirDoc extends SyntaxDocBase {
  readonly op: RedirOp
}

/** Process substitution -- `<(...)` and `>(...)`. */
export interface ProcessSubstDoc extends SyntaxDocBase {
  readonly op: ProcessSubstOp
}

/** Subscript flags -- e.g. `(e)`, `(w)` inside `${arr[(...)...]}`. */
export interface SubscriptFlagDoc extends SyntaxDocBase {
  readonly flag: SubscriptFlag
  readonly args: readonly string[]
}

/** Parameter-expansion flags -- e.g. `(U)`, `(L)` inside `${(...)var}`. */
export interface ParamFlagDoc extends SyntaxDocBase {
  readonly flag: ParamFlag
  readonly args: readonly string[]
}

export interface HistoryDoc extends SyntaxDocBase {
  readonly key: HistoryKey
  readonly kind: HistoryKind
}

/** Globbing operators -- e.g. `*`, `?`, `[...]`. */
export interface GlobOpDoc extends SyntaxDocBase {
  readonly op: GlobOp
}

/** Globbing flags -- e.g. `(#i)`, `(#b)` inside glob patterns. */
export interface GlobbingFlagDoc extends SyntaxDocBase {
  readonly flag: GlobbingFlag
  readonly args: readonly string[]
}
