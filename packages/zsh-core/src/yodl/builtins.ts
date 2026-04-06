import { mkBuiltinName } from "../types/brand"
import type { BuiltinDoc } from "../types/zsh-data"
import { extractItems, normalizeDoc, stripYodl } from "./parse"

interface SynopsisLine {
  raw: string
  text: string
}

export function parseBuiltins(yo: string): BuiltinDoc[] {
  const tail = fromFirstStartItem(yo)
  const byName = new Map<string, BuiltinDoc>()

  for (const doc of macroDocs(tail)) {
    byName.set(doc.name as string, doc)
  }

  const items = extractItems(tail)
  let pending: SynopsisLine[] = []

  for (const item of items) {
    const synopsis = normalizeSynopsis(item.header)
    if (!synopsis) continue

    if (!item.body) {
      pending.push({ raw: item.header, text: synopsis })
      continue
    }

    const lines = [...pending, { raw: item.header, text: synopsis }]
    pending = []

    const heads = lines.filter((line) => !isContinuationSynopsis(line.raw))
    const tails = lines
      .filter((line) => isContinuationSynopsis(line.raw))
      .map((line) => line.text)
    if (heads.length === 0) continue

    const desc = normalizeDoc(stripYodl(item.body))
    const aliasOf = extractAlias(item.body)
    const module = extractModule(item.body)

    for (const head of heads) {
      const name = extractCmdName(head.text)
      if (!name) continue
      byName.set(name, {
        name: mkBuiltinName(name),
        synopsis: [head.text, ...tails],
        desc,
        ...(aliasOf && { aliasOf }),
        ...(module && { module }),
      })
    }
  }

  return [...byName.values()]
}

function macroDocs(yo: string): BuiltinDoc[] {
  const docs: BuiltinDoc[] = []

  for (const line of yo.split("\n")) {
    const alias = line.match(/^alias\(([^)]+)\)\(([^)]+)\)$/)
    if (alias?.[1] && alias[2]) {
      docs.push({
        name: mkBuiltinName(alias[1]),
        synopsis: [alias[1]],
        desc: `Same as \`${alias[2]}\`.`,
        aliasOf: mkBuiltinName(alias[2]),
      })
      continue
    }

    const module = line.match(/^module\(([^)]+)\)\(([^)]+)\)$/)
    if (module?.[1] && module[2]) {
      docs.push({
        name: mkBuiltinName(module[1]),
        synopsis: [module[1]],
        desc: `Available via the \`${module[2]}\` module.`,
        module: module[2],
      })
      continue
    }

    const zle = line.match(/^zlecmd\(([^)]+)\)$/)
    if (zle?.[1]) {
      docs.push({
        name: mkBuiltinName(zle[1]),
        synopsis: [zle[1]],
        desc: "See ZLE builtins.",
      })
    }
  }

  return docs
}

function fromFirstStartItem(yo: string): string {
  const idx = yo.indexOf("startitem()")
  return idx === -1 ? yo : yo.slice(idx)
}

function normalizeSynopsis(raw: string): string {
  return stripYodl(raw)
    .replace(/\\\n/g, "\n")
    .replace(/\\$/gm, "")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim()
}

function isContinuationSynopsis(raw: string): boolean {
  return raw.trimStart().startsWith("SPACES()")
}

function extractCmdName(synopsis: string): string | undefined {
  return synopsis.match(/^(\S+)/)?.[1]
}

function extractAlias(body: string) {
  const m = body.match(/Same as tt\(([^)]+)\)/)
  return m?.[1] ? mkBuiltinName(m[1]) : undefined
}

function extractModule(body: string): string | undefined {
  const m = body.match(/See (?:ifzman|ifnzman)\(.*?The (\S+) Module/)
  return m?.[1]
}
