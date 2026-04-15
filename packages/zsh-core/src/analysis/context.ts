import type { DocLike } from "./doc.ts"
import { factsAt, isCtxFact } from "./facts.ts"

/** Best-effort syntactic bucket for the cursor position. */
export type SyntacticContext =
  | { readonly kind: "setopt" }
  | { readonly kind: "cond" }
  | { readonly kind: "arith" }
  | { readonly kind: "general" }

export type ContextKind = SyntacticContext["kind"]

export function syntacticContext(
  doc: DocLike,
  line: number,
  char: number,
): SyntacticContext {
  const facts = factsAt(doc, line, char).filter(isCtxFact)
  if (facts.some(fact => fact.ctx === "setopt")) return { kind: "setopt" }
  if (facts.some(fact => fact.ctx === "cond")) return { kind: "cond" }
  if (facts.some(fact => fact.ctx === "arith")) return { kind: "arith" }
  return { kind: "general" }
}
