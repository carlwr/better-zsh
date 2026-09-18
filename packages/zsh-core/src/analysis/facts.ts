import { ctxFacts } from "./ctx-facts.ts"
import {
  absSpan,
  hasOffset,
  lineStarts,
  readLines,
  type TextDoc,
  type TextSpan,
} from "./doc.ts"
import type { Fact } from "./fact-types.ts"
import { cmdHeadFactsOnLine, funcDeclsAtLine } from "./line-facts.ts"
import { quotedRegionFacts } from "./quoted-region.ts"

export type { TextDoc, TextLine, TextSpan } from "./doc.ts"
export {
  factText,
  lineStarts,
  offsetAt,
  positionAt,
  textDoc,
} from "./doc.ts"
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
export {
  cmdHeadFactsOnLine,
  type FuncDeclHit,
  funcDeclsAtLine,
} from "./line-facts.ts"
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
export function analyzeDoc(doc: TextDoc): readonly Fact[] {
  const lines = readLines(doc)
  const starts = lineStarts(doc)
  const facts: Fact[] = []
  const quotedRegions = quotedRegionFacts(lines)

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? ""
    const base = starts[i] ?? 0
    for (const decl of funcDeclsAtLine(text)) {
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

/** The facts covering `offset` (as `offsetAt` computes it). */
export function factsAt(
  facts: readonly Fact[],
  offset: number,
): readonly Fact[] {
  return facts.filter(fact =>
    // ctx spans include their closing delimiter, so offset matching is inclusive
    hasOffset(fact.span, offset, fact.kind === "ctx"),
  )
}

function spansIntersect(a: TextSpan, b: TextSpan): boolean {
  return a.start < b.end && b.start < a.end
}
