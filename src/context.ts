import { cmdPositions } from "./cmd-position"
import { commentStart } from "./comment"
import { isSetoptContext } from "./setopt-context"

export type SyntacticContext =
  | { kind: "setopt" }
  | { kind: "cond" }
  | { kind: "arith" }
  | { kind: "general" }

export type ContextKind = SyntacticContext["kind"]

interface DocLike {
  lineAt(i: number): { text: string }
  lineCount: number
}

/** Detect syntactic context at a given position. */
export function syntacticContext(
  doc: DocLike,
  line: number,
  char: number,
): SyntacticContext {
  if (isSetoptContext(doc, line)) return { kind: "setopt" }
  if (isBracketCtx(doc, line, char, "[[", "]]")) return { kind: "cond" }
  if (isSingleBracketCtx(doc, line, char)) return { kind: "cond" }
  if (isBracketCtx(doc, line, char, "((", "))")) return { kind: "arith" }
  return { kind: "general" }
}

/**
 * Walk backwards from (line, char) to detect unmatched open bracket pair.
 * On the current line, scan only up to `char`. On previous lines, scan fully.
 */
function isBracketCtx(
  doc: DocLike,
  line: number,
  char: number,
  open: string,
  close: string,
): boolean {
  let depth = 0
  for (let i = line; i >= 0; i--) {
    const text = doc.lineAt(i).text
    const cut = commentStart(text) ?? text.length
    const end = i === line ? Math.min(char, cut) : cut
    const active = text.slice(0, end)
    depth += countPairs(active, open, close)
    if (depth > 0) return true
  }
  return false
}

function isSingleBracketCtx(doc: DocLike, line: number, char: number): boolean {
  const text = doc.lineAt(line).text
  const cut = commentStart(text) ?? text.length
  const active = text.slice(0, Math.min(char, cut))
  if (!active.trim()) return false
  const pos = cmdPositions(active).at(-1)
  if (!pos) return false
  const cmd = active.slice(pos.start, pos.end)
  if (cmd === "test") return true
  if (cmd !== "[") return false
  return !hasClosingBracket(active.slice(pos.end))
}

function hasClosingBracket(s: string): boolean {
  return /(^|\s)\](?=\s|$|[;|&)])/.test(s)
}

/** Count net open (+1) vs close (-1) bracket pairs, respecting quotes. */
function countPairs(line: string, open: string, close: string): number {
  let depth = 0
  let sq = false
  let dq = false
  let esc = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (esc) {
      esc = false
      continue
    }
    if (ch === "\\") {
      esc = true
      continue
    }
    if (sq) {
      if (ch === "'") sq = false
      continue
    }
    if (dq) {
      if (ch === '"') dq = false
      continue
    }
    if (ch === "'") {
      sq = true
      continue
    }
    if (ch === '"') {
      dq = true
      continue
    }
    if (ch === open[0] && i + 1 < line.length && line[i + 1] === open[1]) {
      depth++
      i++
    } else if (
      ch === close[0] &&
      i + 1 < line.length &&
      line[i + 1] === close[1]
    ) {
      depth--
      i++
    }
  }
  return depth
}
