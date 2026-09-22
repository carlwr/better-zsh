import type { Fact } from "./fact-types"
import { factsAt, isCtxFact } from "./facts"

/** Best-effort syntactic bucket for the cursor position. */
export type SyntacticContext = "setopt" | "cond" | "arith" | "general"

/** The bucket at `offset` (as `offsetAt` computes it) in a document's facts. */
export function syntacticContext(
  facts: readonly Fact[],
  offset: number,
): SyntacticContext {
  const ctxs = factsAt(facts, offset).filter(isCtxFact)
  if (ctxs.some(fact => fact.ctx === "setopt")) return "setopt"
  if (ctxs.some(fact => fact.ctx === "cond")) return "cond"
  if (ctxs.some(fact => fact.ctx === "arith")) return "arith"
  return "general"
}
