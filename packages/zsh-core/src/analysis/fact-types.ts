import type { Observed } from "../docs/types.ts"
import type { TextSpan } from "./doc.ts"

/** Confidence level: "hard" for structural syntax, "heuristic" for best-effort detection. */
export type FactStrength = "hard" | "heuristic"
export type FactCtx = "setopt" | "cond" | "arith"
export type QuoteStyle = "'" | '"'
export type FactKind =
  | "ctx"
  | "cmd-head"
  | "precmd"
  | "func-decl"
  | "redir"
  | "process-subst"
  | "reserved-word"
  | "quoted-region"

export interface BaseFact {
  readonly kind: FactKind
  readonly span: TextSpan
  readonly strength: FactStrength
}

/** Fact spanning a syntactic region (setopt, conditional, arithmetic). */
export interface CtxFact extends BaseFact {
  readonly kind: "ctx"
  readonly ctx: FactCtx
}

export interface CmdHeadFact extends BaseFact {
  readonly kind: "cmd-head"
  /** Raw command-head spelling; may name a builtin, function, alias, or external command. */
  readonly text: string
  readonly precmds: readonly Observed<"precmd_modifier">[]
}

export interface PrecmdFact extends BaseFact {
  readonly kind: "precmd"
  readonly name: Observed<"precmd_modifier">
}

export interface FuncDeclFact extends BaseFact {
  readonly kind: "func-decl"
  /** unvalidated; regex-matched from source text */
  readonly name: string
  readonly nameSpan: TextSpan
}

export interface RedirFact extends BaseFact {
  readonly kind: "redir"
  readonly text: string
}

export interface ProcessSubstFact extends BaseFact {
  readonly kind: "process-subst"
  readonly text: string
}

export interface ReservedWordFact extends BaseFact {
  readonly kind: "reserved-word"
  readonly text: string
}

/**
 * Conservatively recognized closed quoted region.
 * Emitted regions are non-overlapping; unsupported constructs may be omitted.
 */
export interface QuotedRegionFact extends BaseFact {
  readonly kind: "quoted-region"
  readonly quote: QuoteStyle
  readonly multiline: boolean
}

export type Fact =
  | CtxFact
  | CmdHeadFact
  | PrecmdFact
  | FuncDeclFact
  | RedirFact
  | ProcessSubstFact
  | ReservedWordFact
  | QuotedRegionFact

/** Facts in command position. */
export type CmdFact = CmdHeadFact | PrecmdFact
/** All fact types produced by single-line scanning. */
export type LineFact = CmdFact | RedirFact | ProcessSubstFact | ReservedWordFact

const guardFor =
  <K extends FactKind>(kind: K) =>
  (fact: Fact): fact is Extract<Fact, { kind: K }> =>
    fact.kind === kind

// Explicit return types are required for JSR slow-types compliance.
type FactGuard<F extends Fact> = (fact: Fact) => fact is F

export const isCmdHeadFact: FactGuard<CmdHeadFact> = guardFor("cmd-head")
export const isCtxFact: FactGuard<CtxFact> = guardFor("ctx")
export const isFuncDeclFact: FactGuard<FuncDeclFact> = guardFor("func-decl")
export const isPrecmdFact: FactGuard<PrecmdFact> = guardFor("precmd")
export const isRedirFact: FactGuard<RedirFact> = guardFor("redir")
export const isProcessSubstFact: FactGuard<ProcessSubstFact> =
  guardFor("process-subst")
export const isReservedWordFact: FactGuard<ReservedWordFact> =
  guardFor("reserved-word")
export const isQuotedRegionFact: FactGuard<QuotedRegionFact> =
  guardFor("quoted-region")
