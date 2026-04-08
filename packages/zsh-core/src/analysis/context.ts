import { type DocLike, factsAt, isCtxFact } from "./facts.ts"

/** Best-effort syntactic bucket for the cursor position. */
export type SyntacticContext =
  | { kind: "setopt" }
  | { kind: "cond" }
  | { kind: "arith" }
  | { kind: "general" }

export type ContextKind = SyntacticContext["kind"]

export function syntacticContext(
  doc: DocLike,
  line: number,
  char: number,
): SyntacticContext {
  const facts = factsAt(doc, line, char).filter(isCtxFact)
  if (facts.some((fact) => fact.ctx === "setopt")) return { kind: "setopt" }
  if (facts.some((fact) => fact.ctx === "cond")) return { kind: "cond" }
  if (facts.some((fact) => fact.ctx === "arith")) return { kind: "arith" }
  return { kind: "general" }
}
