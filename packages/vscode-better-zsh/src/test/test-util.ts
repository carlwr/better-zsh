import type { DocCorpus } from "@carlwr/zsh-core"
import { docCategories } from "@carlwr/zsh-core/taxonomy"

const WORD = /[\w-]/

let id = 0

function uri(scope: string) {
  return { toString: () => `test://${scope}/${id++}` }
}

export function lineDoc(text: string, scope = "doc") {
  const lines = text.split("\n")
  return {
    uri: uri(scope),
    version: 1,
    lineCount: lines.length,
    lineAt(i: number) {
      return { text: lines[i] ?? "" }
    },
  } as import("vscode").TextDocument
}

/** Index records by a field value into a Map. */
export const by = <K extends PropertyKey, T extends Record<K, unknown>>(
  field: K,
  xs: readonly T[],
) => new Map(xs.map(x => [x[field], x]))

/** A `DocCorpus` with every category as an empty Map; override per test. */
export function emptyCorpus(): DocCorpus {
  const mt = new Map()
  return Object.fromEntries(
    docCategories.map(c => [c, mt]),
  ) as unknown as DocCorpus
}

export function wordDoc(text: string, scope = "doc") {
  const base = lineDoc(text, scope)
  return {
    ...base,
    getText(range?: {
      start: { line: number; character: number }
      end: { line: number; character: number }
    }) {
      if (!range) return text
      const line = base.lineAt(range.start.line).text
      return line.slice(range.start.character, range.end.character)
    },
    getWordRangeAtPosition(pos: { line: number; character: number }) {
      const line = base.lineAt(pos.line).text
      if (!WORD.test(line[pos.character] ?? "")) return
      let start = pos.character
      while (WORD.test(line[start - 1] ?? "")) start--
      let end = pos.character + 1
      while (WORD.test(line[end] ?? "")) end++
      return {
        start: { line: pos.line, character: start },
        end: { line: pos.line, character: end },
      }
    },
  } as unknown as import("vscode").TextDocument
}
