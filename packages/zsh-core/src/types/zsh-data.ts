import type { BuiltinName, CondOp, OptFlagChar, OptName } from "./brand.ts"

/** Default-on marker from zshoptions: <D>=default, <K>=ksh, <S>=sh, <C>=csh, <Z>=zsh */
export type DefaultMarker = "D" | "K" | "S" | "C" | "Z"

/** Conditional expression: unary (-a file) vs binary (f1 -nt f2) */
export type CondKind = "unary" | "binary"

export type Emulation = "csh" | "ksh" | "sh" | "zsh"

export type OptState = "on" | "off"

export type OptFlagSign = "+" | "-"

export type ReservedWordPos = "command" | "any"

export type HistoryKind = "event-designator" | "word-designator" | "modifier"

/** Precommand modifiers accepted before a command head. */
export type PrecmdName =
  | "-"
  | "builtin"
  | "command"
  | "exec"
  | "nocorrect"
  | "noglob"

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

/** Parsed `[[ ... ]]` conditional operator docs. */
export interface CondOperator {
  op: CondOp
  operands: string[]
  desc: string
  kind: CondKind
}

/** Parsed builtin command doc block. */
export interface BuiltinDoc {
  name: BuiltinName
  synopsis: readonly string[]
  desc: string
  module?: string
  aliasOf?: BuiltinName
}

/** Parsed precommand modifier doc block. */
export interface PrecmdDoc {
  name: PrecmdName
  synopsis: readonly string[]
  desc: string
}

export interface SyntaxDocBase {
  sig: string
  desc: string
  section: string
  aliases?: readonly string[]
}

export interface ReservedWordDoc extends SyntaxDocBase {
  name: string
  pos: ReservedWordPos
}

export interface RedirDoc extends SyntaxDocBase {
  op: string
}

export type RedirectionDoc = RedirDoc

export interface ProcessSubstDoc extends SyntaxDocBase {
  op: string
}

export interface SubscriptFlagDoc extends SyntaxDocBase {
  flag: string
  args: readonly string[]
}

export interface ParamFlagDoc extends SyntaxDocBase {
  flag: string
  args: readonly string[]
}

export interface HistoryDoc extends SyntaxDocBase {
  key: string
  kind: HistoryKind
}

export interface GlobOpDoc extends SyntaxDocBase {
  op: string
}

export type GlobOperatorDoc = GlobOpDoc

export interface GlobbingFlagDoc extends SyntaxDocBase {
  flag: string
  args: readonly string[]
}

export type GlobFlagDoc = GlobbingFlagDoc
