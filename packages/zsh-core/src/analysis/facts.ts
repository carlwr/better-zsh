import { ctxFacts } from "./ctx-facts.ts"
import {
  absSpan,
  type DocLike,
  hasOffset,
  lineStarts,
  readLines,
  type TextSpan,
} from "./doc.ts"
import type { Fact } from "./fact-types.ts"
import { cmdHeadFactsOnLine, funcDeclAtLine } from "./line-facts.ts"

export type { DocLike, DocLine, TextSpan } from "./doc.ts"
export { factText } from "./doc.ts"
export type {
  BaseFact,
  CmdFact,
  CmdHeadFact,
  CtxFact,
  Fact,
  FactCtx,
  FactKind,
  FactStrength,
  FuncDeclFact,
  LineFact,
  PrecmdFact,
  ProcessSubstFact,
  RedirFact,
  ReservedWordFact,
} from "./fact-types.ts"
export {
  isCtxFact,
  isFuncDeclFact,
  isPrecmdFact,
  isProcessSubstFact,
  isRedirFact,
  isReservedWordFact,
} from "./fact-types.ts"
export { cmdHeadFactsOnLine, funcDeclAtLine } from "./line-facts.ts"

function shiftFact<T extends { span: TextSpan }>(base: number, fact: T): T {
  return { ...fact, span: absSpan(base, fact.span) }
}

/** Analyze a whole document and return coarse zsh syntax facts. */
export function analyzeDoc(doc: DocLike): readonly Fact[] {
  const lines = readLines(doc)
  const starts = lineStarts(lines)
  const facts: Fact[] = []

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? ""
    const base = starts[i] ?? 0
    const decl = funcDeclAtLine(text)
    if (decl) {
      facts.push({
        kind: "func-decl",
        span: absSpan(base, { start: 0, end: text.length }),
        name: decl.name,
        nameSpan: absSpan(base, {
          start: decl.start,
          end: decl.start + decl.name.length,
        }),
        strength: "hard",
      })
    }

    for (const fact of cmdHeadFactsOnLine(text)) {
      facts.push(shiftFact(base, fact))
    }
  }

  facts.push(...ctxFacts(lines, starts))

  return facts
}

export function factsAt(
  doc: DocLike,
  line: number,
  char: number,
): readonly Fact[] {
  const starts = lineStarts(readLines(doc))
  const off = (starts[line] ?? 0) + char
  return analyzeDoc(doc).filter((fact) =>
    // ctx spans include their closing delimiter, so offset matching is inclusive
    hasOffset(fact.span, off, fact.kind === "ctx"),
  )
}
