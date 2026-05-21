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
import { quotedRegionFacts } from "./quoted-region.ts"

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
  QuotedRegionFact,
  QuoteStyle,
  RedirFact,
  ReservedWordFact,
} from "./fact-types.ts"
export {
  isCmdHeadFact,
  isCtxFact,
  isFuncDeclFact,
  isPrecmdFact,
  isProcessSubstFact,
  isQuotedRegionFact,
  isRedirFact,
  isReservedWordFact,
} from "./fact-types.ts"
export { cmdHeadFactsOnLine, funcDeclAtLine } from "./line-facts.ts"
export { quotedRegionFacts } from "./quoted-region.ts"

function shiftFact<T extends { span: TextSpan }>(base: number, fact: T): T {
  return { ...fact, span: absSpan(base, fact.span) }
}

const QUOTED_FILTERED_KINDS: ReadonlySet<Fact["kind"]> = new Set([
  "cmd-head",
  "precmd",
  "reserved-word",
  "redir",
  "process-subst",
])

/** Analyze a whole document and return coarse zsh syntax facts. */
export function analyzeDoc(doc: DocLike): readonly Fact[] {
  const lines = readLines(doc)
  const starts = lineStarts(lines)
  const facts: Fact[] = []
  const quotedRegions = quotedRegionFacts(lines)

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
  facts.push(...quotedRegions)

  return facts.filter(
    fact =>
      fact.kind === "quoted-region" ||
      !(
        QUOTED_FILTERED_KINDS.has(fact.kind) &&
        quotedRegions.some(quote => spansIntersect(fact.span, quote.span))
      ),
  )
}

export function factsAt(
  doc: DocLike,
  line: number,
  char: number,
): readonly Fact[] {
  const starts = lineStarts(readLines(doc))
  const off = (starts[line] ?? 0) + char
  return analyzeDoc(doc).filter(fact =>
    // ctx spans include their closing delimiter, so offset matching is inclusive
    hasOffset(fact.span, off, fact.kind === "ctx"),
  )
}

function spansIntersect(a: TextSpan, b: TextSpan): boolean {
  return a.start < b.end && b.start < a.end
}
