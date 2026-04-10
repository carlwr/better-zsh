import type { BuiltinName } from "../types/brand.ts"
import type { PrecmdName } from "../types/precmd.ts"
import type { TextSpan } from "./doc.ts"

/** Confidence level: "hard" for structural syntax, "heuristic" for best-effort detection. */
export type FactStrength = "hard" | "heuristic"
export type FactCtx = "setopt" | "cond" | "arith"
export type FactKind =
  | "ctx"
  | "cmd-head"
  | "precmd"
  | "func-decl"
  | "redir"
  | "process-subst"
  | "reserved-word"

export interface BaseFact {
  kind: FactKind
  span: TextSpan
  strength: FactStrength
}

/** Fact spanning a syntactic region (setopt, conditional, arithmetic). */
export interface CtxFact extends BaseFact {
  kind: "ctx"
  ctx: FactCtx
}

export interface CmdHeadFact extends BaseFact {
  kind: "cmd-head"
  text: string
  name: BuiltinName
  precmds: readonly PrecmdName[]
}

export interface PrecmdFact extends BaseFact {
  kind: "precmd"
  text: string
  name: PrecmdName
}

export interface FuncDeclFact extends BaseFact {
  kind: "func-decl"
  /** unvalidated; regex-matched from source text */
  name: string
  nameSpan: TextSpan
}

export interface RedirFact extends BaseFact {
  kind: "redir"
  text: string
}

export interface ProcessSubstFact extends BaseFact {
  kind: "process-subst"
  text: string
}

export interface ReservedWordFact extends BaseFact {
  kind: "reserved-word"
  text: string
}

export type Fact =
  | CtxFact
  | CmdHeadFact
  | PrecmdFact
  | FuncDeclFact
  | RedirFact
  | ProcessSubstFact
  | ReservedWordFact

/** Facts in command position. */
export type CmdFact = CmdHeadFact | PrecmdFact
/** All fact types produced by single-line scanning. */
export type LineFact = CmdFact | RedirFact | ProcessSubstFact | ReservedWordFact

export function isCmdHeadFact(fact: Fact): fact is CmdHeadFact {
  return fact.kind === "cmd-head"
}

export function isCtxFact(fact: Fact): fact is CtxFact {
  return fact.kind === "ctx"
}

export function isFuncDeclFact(fact: Fact): fact is FuncDeclFact {
  return fact.kind === "func-decl"
}

export function isPrecmdFact(fact: Fact): fact is PrecmdFact {
  return fact.kind === "precmd"
}

export function isRedirFact(fact: Fact): fact is RedirFact {
  return fact.kind === "redir"
}

export function isProcessSubstFact(fact: Fact): fact is ProcessSubstFact {
  return fact.kind === "process-subst"
}

export function isReservedWordFact(fact: Fact): fact is ReservedWordFact {
  return fact.kind === "reserved-word"
}
