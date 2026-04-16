import { mkObserved } from "../docs/brands.ts"
import { advanceQuote, isQuoted, mkQuoteState } from "../quote-state.ts"
import {
  absSpan,
  activeText,
  continuedLineBlock,
  continuedText,
  type TextSpan,
} from "./doc.ts"
import type { CtxFact, FactCtx } from "./fact-types.ts"
import { cmdHeadFactsOnLine, firstCmdHeadOnLine } from "./line-facts.ts"
import { isSetoptCommandText } from "./setopt-cmd.ts"

export function ctxFacts(
  lines: readonly string[],
  starts: readonly number[],
): CtxFact[] {
  return [
    ...scanPairedCtx(lines, starts, "[[", "]]", "cond"),
    ...scanPairedCtx(lines, starts, "((", "))", "arith"),
    ...scanBracketTestCtx(lines, starts),
    ...scanSetoptCtx(lines, starts),
  ]
}

function scanPairedCtx(
  lines: readonly string[],
  starts: readonly number[],
  open: string,
  close: string,
  ctx: FactCtx,
): CtxFact[] {
  const out: CtxFact[] = []
  let depth = 0
  let qst = mkQuoteState()
  let start = 0

  for (let line = 0; line < lines.length; line++) {
    const text = activeText(lines[line] ?? "")
    const base = starts[line] ?? 0
    for (let i = 0; i < text.length; i++) {
      const ch = text.charAt(i)
      const prev = qst
      qst = advanceQuote(qst, ch)
      if (isQuoted(prev)) continue
      if (matchesAt(text, i, open)) {
        if (depth === 0) start = base + i
        depth++
        i++
        continue
      }
      if (matchesAt(text, i, close) && depth > 0) {
        depth--
        if (depth === 0)
          out.push(ctxFact(ctx, { start, end: base + i + close.length }))
        i++
      }
    }
  }

  return out
}

function scanBracketTestCtx(
  lines: readonly string[],
  starts: readonly number[],
): CtxFact[] {
  const out: CtxFact[] = []

  for (let line = 0; line < lines.length; line++) {
    const text = activeText(lines[line] ?? "")
    const base = starts[line] ?? 0
    for (const fact of cmdHeadFactsOnLine(text)) {
      if (fact.kind !== "cmd-head") continue
      if (fact.text !== "[" && fact.text !== "test") continue
      const end =
        fact.text === "test" ? text.length : closingBracket(text, fact.span.end)
      out.push(ctxFact("cond", absSpan(base, { start: fact.span.start, end })))
    }
  }

  return out
}

function scanSetoptCtx(
  lines: readonly string[],
  starts: readonly number[],
): CtxFact[] {
  const out: CtxFact[] = []

  for (let line = 0; line < lines.length; line++) {
    const block = continuedLineBlock(lines, line)
    if (block.start !== line) continue

    const headLine = activeText(lines[block.start] ?? "")
    const head = firstCmdHeadOnLine(headLine)
    if (!head || head.precmds.includes(mkObserved("precmd", "command")))
      continue
    const text = continuedText(lines, block.start, block.end).slice(
      head.span.start,
    )
    if (!isSetoptCommandText(text)) continue

    const last = activeText(lines[block.end] ?? "")
    out.push(
      ctxFact("setopt", {
        start: (starts[block.start] ?? 0) + head.span.start,
        end: (starts[block.end] ?? 0) + last.length,
      }),
    )
  }

  return out
}

function ctxFact(ctx: FactCtx, span: TextSpan): CtxFact {
  return { kind: "ctx", ctx, span, strength: "heuristic" }
}

function matchesAt(s: string, pos: number, token: string): boolean {
  return s.slice(pos, pos + token.length) === token
}

function closingBracket(line: string, pos: number): number {
  const m = /(^|\s)\](?=\s|$|[;|&)])/.exec(line.slice(pos))
  return m?.index !== undefined ? pos + m.index + m[0].length : line.length
}
