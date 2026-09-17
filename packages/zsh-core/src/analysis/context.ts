import type { Fact } from "./fact-types.ts"
import { factsAt, isCtxFact } from "./facts.ts"

/** Best-effort syntactic bucket for the cursor position. */
export type SyntacticContext =
  | { readonly kind: "setopt" }
  | { readonly kind: "cond" }
  | { readonly kind: "arith" }
  | { readonly kind: "general" }

export type ContextKind = SyntacticContext["kind"]

/** The bucket at `offset` (as `offsetAt` computes it) in a document's facts. */
export function syntacticContext(
  facts: readonly Fact[],
  offset: number,
): SyntacticContext {
  const ctxs = factsAt(facts, offset).filter(isCtxFact)
  if (ctxs.some(fact => fact.ctx === "setopt")) return { kind: "setopt" }
  if (ctxs.some(fact => fact.ctx === "cond")) return { kind: "cond" }
  if (ctxs.some(fact => fact.ctx === "arith")) return { kind: "arith" }
  return { kind: "general" }
}
