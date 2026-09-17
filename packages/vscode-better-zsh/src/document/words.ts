import { escapeRegExp } from "@carlwr/typescript-extra"
import { commentStart } from "@carlwr/zsh-core/analysis"
import * as vscode from "vscode"

/** Word-like token pattern used by editor range lookups and validation. */
export const WORD = /[\w][\w-]*/
export const WORD_EXACT = new RegExp(`^${WORD.source}$`)

/** Where a line's code ends: its comment start, else its length. */
export const activeEnd = (line: string) => commentStart(line) ?? line.length

/** The code part of a line: comments are inactive syntax. */
export const activeText = (line: string) => line.slice(0, activeEnd(line))

export interface ActiveLine {
  readonly text: string
  /** Where the line's code ends. */
  readonly cut: number
}

/** The line at `pos`, unless `pos` is in its comment. */
export function activeLineAt(
  doc: vscode.TextDocument,
  pos: vscode.Position,
): ActiveLine | undefined {
  const text = doc.lineAt(pos.line).text
  const cut = activeEnd(text)
  return pos.character < cut ? { text, cut } : undefined
}

/** The word at `pos`, unless in a comment; strings stay active — zsh meta-programming passes function names through quotes. */
export function activeWordRangeAt(
  doc: vscode.TextDocument,
  pos: vscode.Position,
): vscode.Range | undefined {
  const range = doc.getWordRangeAtPosition(pos, WORD)
  if (!range) return
  if (range.start.character >= activeEnd(doc.lineAt(pos.line).text)) return
  return range
}

/** Whole-word occurrences of `word` outside comments. */
export function wordMatches(
  doc: vscode.TextDocument,
  word: string,
): vscode.Range[] {
  if (!WORD_EXACT.test(word)) return []
  const re = new RegExp(`(?<![\\w-])${escapeRegExp(word)}(?![\\w-])`, "g")
  const out: vscode.Range[] = []
  for (let line = 0; line < doc.lineCount; line++) {
    const active = activeText(doc.lineAt(line).text)
    for (const m of active.matchAll(re))
      out.push(new vscode.Range(line, m.index, line, m.index + word.length))
  }
  return out
}

/** Whole-word occurrences, outside comments, of the word at `pos`. */
export function wordMatchesAt(
  doc: vscode.TextDocument,
  pos: vscode.Position,
): vscode.Range[] | undefined {
  const range = activeWordRangeAt(doc, pos)
  return range && wordMatches(doc, doc.getText(range))
}
