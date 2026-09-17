import type { DocCorpus } from "@carlwr/zsh-core"
import { docCategories } from "@carlwr/zsh-core/taxonomy"
import type * as vscode from "vscode"
import { WORD } from "../document/words"

let id = 0

function uri(scope: string) {
  return { toString: () => `test://${scope}/${id++}` }
}

/** A `TextDocument` with lines only: what analysis-driven providers read. */
export function lineDoc(text: string, scope = "doc") {
  const lines = text.split("\n")
  return {
    uri: uri(scope),
    version: 1,
    lineCount: lines.length,
    lineAt(i: number) {
      return { text: lines[i] ?? "" }
    },
  } as vscode.TextDocument
}

/** `lineDoc` plus the word/range API that hover and completions use. */
export function wordDoc(text: string, scope = "doc") {
  const base = lineDoc(text, scope)
  return {
    ...base,
    getText(range?: vscode.Range) {
      if (!range) return text
      const line = base.lineAt(range.start.line).text
      return line.slice(range.start.character, range.end.character)
    },
    getWordRangeAtPosition(pos: vscode.Position) {
      const line = base.lineAt(pos.line).text
      const re = new RegExp(WORD.source, "g")
      // As VS Code: a cursor right after a word is on that word.
      for (const m of line.matchAll(re)) {
        const end = m.index + m[0].length
        if (m.index <= pos.character && pos.character <= end)
          return {
            start: { line: pos.line, character: m.index },
            end: { line: pos.line, character: end },
          }
      }
      return undefined
    },
  } as unknown as vscode.TextDocument
}

export const pos = (line: number, character: number) =>
  ({ line, character }) as vscode.Position

/** Index records by a field value into a Map. */
export const by = <K extends PropertyKey, T extends Record<K, unknown>>(
  field: K,
  xs: readonly T[],
) => new Map(xs.map(x => [x[field], x]))

/** A `DocCorpus` with every category as an empty Map; override per test. */
export function emptyCorpus(): DocCorpus {
  return Object.fromEntries(
    docCategories.map(c => [c, new Map()]),
  ) as unknown as DocCorpus
}
