import * as vscode from "vscode"
import type { RedirFact } from "../analysis/facts"
import { activeLineAt } from "./words"

export function isTokenDelimiter(ch: string): boolean {
  return /[\s;|&(){}<>]/.test(ch)
}

/** The delimiter-split shell token at `pos`, unless in a comment. */
export function activeTokenRangeAt(
  doc: vscode.TextDocument,
  pos: vscode.Position,
): vscode.Range | undefined {
  const line = activeLineAt(doc, pos)
  if (!line) return
  const { text, cut } = line
  if (isTokenDelimiter(text[pos.character] ?? "")) return
  let start = pos.character
  while (start > 0 && !isTokenDelimiter(text[start - 1] ?? "")) start--
  let end = pos.character
  while (end < cut && !isTokenDelimiter(text[end] ?? "")) end++
  return start === end
    ? undefined
    : new vscode.Range(pos.line, start, pos.line, end)
}

/** The longest of `ops` (pre-sorted by length) around `pos`, delimited by whitespace or brackets. */
export function symbolicOpRangeAt(
  doc: vscode.TextDocument,
  pos: vscode.Position,
  ops: readonly string[],
): vscode.Range | undefined {
  const line = activeLineAt(doc, pos)
  if (!line) return
  for (const op of ops) {
    const range = operatorRangeAt(line.text, pos.character, line.cut, op)
    if (range)
      return new vscode.Range(pos.line, range.start, pos.line, range.end)
  }
}

function operatorRangeAt(
  text: string,
  pos: number,
  cut: number,
  op: string,
): { start: number; end: number } | undefined {
  const startMin = Math.max(0, pos - op.length + 1)
  const startMax = Math.min(pos, cut - op.length)
  for (let start = startMin; start <= startMax; start++) {
    const end = start + op.length
    if (text.slice(start, end) !== op) continue
    if (opBoundary(text[start - 1]) && opBoundary(text[end]))
      return { start, end }
  }
}

function opBoundary(ch: string | undefined): boolean {
  return ch === undefined || /[\s[\]]/.test(ch)
}

/** The redirection operator plus its operand token, when `pos` is inside them. */
export function activeRedirRangeAt(
  doc: vscode.TextDocument,
  pos: vscode.Position,
  redir: RedirFact,
): vscode.Range | undefined {
  const line = activeLineAt(doc, pos)
  if (!line || pos.character < redir.span.start) return
  const { text, cut } = line

  let end = redir.span.end
  while (end < cut && !isTokenDelimiter(text[end] ?? "")) end++
  if (pos.character >= end) return

  return new vscode.Range(pos.line, redir.span.start, pos.line, end)
}
