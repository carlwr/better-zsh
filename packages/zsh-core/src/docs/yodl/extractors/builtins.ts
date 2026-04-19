import type { NonEmpty } from "@carlwr/typescript-extra"
import { mkDocumented } from "../../brands.ts"
import type { BuiltinDoc } from "../../types.ts"
import { collectAliasedEntries, extractItems } from "../core/doc.ts"
import { isMacro, parseNodes, type YNodeSeq } from "../core/nodes.ts"
import { normalizeBody, normalizeHeader, stripYodl } from "../core/text.ts"

interface SynopsisLine {
  text: string
  continuation: boolean
}

export function parseBuiltins(yo: string): readonly BuiltinDoc[] {
  const nodes = parseNodes(yo)
  const byName = new Map<string, BuiltinDoc>()

  for (const doc of macroDocs(nodes)) {
    byName.set(doc.name as string, doc)
  }

  for (const entry of collectAliasedEntries(
    extractItems(nodes),
    parseSynopsisLine,
  )) {
    const body = entry.entry.body ?? []
    const lines = [...entry.aliases, entry.head]
    const synopsisTail = lines
      .filter(line => line.continuation)
      .map(line => line.text)
    const heads = lines.filter(line => !line.continuation)
    if (heads.length === 0) continue

    const desc = normalizeBody(body)
    const aliasOf = extractAlias(body)
    const module = extractModule(body)

    for (const head of heads) {
      const name = extractCmdName(head.text)
      if (!name) continue
      const synopsis: NonEmpty<string> = [head.text, ...synopsisTail]
      byName.set(name, {
        name: mkDocumented("builtin", name),
        synopsis,
        desc,
        ...(aliasOf && { aliasOf }),
        ...(module && { module }),
      })
    }
  }

  return [...byName.values()]
}

function macroDocs(nodes: YNodeSeq): BuiltinDoc[] {
  const docs: BuiltinDoc[] = []

  for (const node of nodes) {
    if (isMacro(node, "alias")) {
      const name = normalizeHeader(node.args[0] ?? [])
      const target = normalizeHeader(node.args[1] ?? [])
      if (!name || !target) continue
      docs.push({
        name: mkDocumented("builtin", name),
        synopsis: [name],
        desc: `Same as \`${target}\`.`,
        aliasOf: mkDocumented("builtin", target),
      })
      continue
    }

    if (isMacro(node, "module")) {
      const name = normalizeHeader(node.args[0] ?? [])
      const module = normalizeHeader(node.args[1] ?? [])
      if (!name || !module) continue
      docs.push({
        name: mkDocumented("builtin", name),
        synopsis: [name],
        desc: `Available via the \`${module}\` module.`,
        module,
      })
      continue
    }

    if (isMacro(node, "zlecmd")) {
      const name = normalizeHeader(node.args[0] ?? [])
      if (!name) continue
      docs.push({
        name: mkDocumented("builtin", name),
        synopsis: [name],
        desc: "See ZLE builtins.",
      })
    }
  }

  return docs
}

function normalizeSynopsis(raw: YNodeSeq): string {
  return stripYodl(raw)
    .replace(/\\\n/g, "\n")
    .replace(/\\$/gm, "")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim()
}

function parseSynopsisLine(raw: YNodeSeq): SynopsisLine | undefined {
  const text = normalizeSynopsis(raw)
  return text
    ? {
        text,
        continuation: isMacro(raw[0], "SPACES"),
      }
    : undefined
}

function extractCmdName(synopsis: string): string | undefined {
  return synopsis.match(/^(\S+)/)?.[1]
}

function extractAlias(body: YNodeSeq) {
  // Match either a backtick-apostrophe-wrapped name (e.g. `.' for the dot builtin)
  // or a plain word. The backtick-quote form arises when the upstream source uses
  // `tt(name)' and stripYodl leaves the wrapping delimiters around the rendered name.
  const m = stripYodl(body).match(/\bSame as (?:`([^']*)'|([^.\s]+))/)
  const name = m?.[1] ?? m?.[2]
  return name ? mkDocumented("builtin", name) : undefined
}

function extractModule(body: YNodeSeq): string | undefined {
  const m = stripYodl(body)
    .replace(/\s+/g, " ")
    .match(/\bThe (\S+) Module\b/)
  return m?.[1]
}
