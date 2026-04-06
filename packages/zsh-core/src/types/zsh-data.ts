import type { BuiltinName, CondOp, OptFlagChar, OptName } from "./brand.ts"

/** Default-on marker from zshoptions: <D>=default, <K>=ksh, <S>=sh, <C>=csh, <Z>=zsh */
export type DefaultMarker = "D" | "K" | "S" | "C" | "Z"

/** Conditional expression: unary (-a file) vs binary (f1 -nt f2) */
export type CondKind = "unary" | "binary"

export type Emulation = "csh" | "ksh" | "sh" | "zsh"

export type OptState = "on" | "off"

export type OptFlagSign = "+" | "-"

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
  display: string // "AUTO_CD" — UPPER_CASE from docs
  flags: readonly OptFlagAlias[]
  defaultIn: readonly Emulation[]
  category: string // "Changing Directories"
  desc: string
}

/** Parsed `[[ ... ]]` conditional operator docs. */
export interface CondOperator {
  op: CondOp // "-a", "-nt", "=~"
  operands: string[] // ["file"], ["file1", "file2"]
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
