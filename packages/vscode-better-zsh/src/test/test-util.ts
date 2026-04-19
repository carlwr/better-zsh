import type { DocCorpus } from "@carlwr/zsh-core"
import { docCategories } from "@carlwr/zsh-core"

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
  return {
    ...lineDoc(text, scope),
    getText(range?: {
      start: { character: number }
      end: { character: number }
    }) {
      return range
        ? text.slice(range.start.character, range.end.character)
        : text
    },
    getWordRangeAtPosition(pos: { character: number }) {
      if (!WORD.test(text[pos.character] ?? "")) return
      let start = pos.character
      while (WORD.test(text[start - 1] ?? "")) start--
      let end = pos.character + 1
      while (WORD.test(text[end] ?? "")) end++
      return {
        start: { line: 0, character: start },
        end: { line: 0, character: end },
      }
    },
  } as unknown as import("vscode").TextDocument
}
