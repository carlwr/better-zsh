import type { NonEmpty } from "@carlwr/typescript-extra"
import { mkDocumented } from "../../brands.ts"
import type { BuiltinDoc } from "../../types.ts"
import { collectAliasedEntries, extractItems } from "../core/doc.ts"
import { asNodes, isMacro, type YNodeSeq, type YodlSrc } from "../core/nodes.ts"
import { normalizeHeader, stripYodl } from "../core/text.ts"
import { splitFlagBody } from "./flag-section.ts"

interface SynopsisLine {
  text: string
  continuation: boolean
}

export function parseBuiltins(
  yo: YodlSrc,
  depth?: number,
): readonly BuiltinDoc[] {
  const nodes = asNodes(yo)
  const byName = new Map<string, BuiltinDoc>()

  for (const doc of macroDocs(nodes)) {
    byName.set(doc.name, doc)
  }

  for (const entry of collectAliasedEntries(
    extractItems(nodes, depth),
    parseSynopsisLine,
  )) {
    const body = entry.entry.body ?? []
    const lines = [...entry.aliases, entry.head]
    const synopsisTail = lines.filter(l => l.continuation).map(l => l.text)
    const heads = lines.filter(l => !l.continuation)
    if (heads.length === 0) continue

    const { desc, flagGroups, outro } = splitFlagBody(body)
    const aliasOf = extractAlias(body)
    const module = extractModule(body)

    for (const head of heads) {
      const name = head.text.match(/^(\S+)/)?.[1]
      if (!name) continue
      const synopsis: NonEmpty<string> = [head.text, ...synopsisTail]
      byName.set(name, {
        name: mkDocumented("builtin", name),
        synopsis,
        desc,
        ...(aliasOf && { aliasOf }),
        ...(module && { module }),
        ...(flagGroups && { flagGroups }),
        ...(outro && { outro }),
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
  // Synopsis ends up inside a fenced ```zsh code block — strip tt/var
  // markup to plain text so the code block stays clean.
  return stripYodl(raw, "code")
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
  if (!text) return undefined
  return { text, continuation: isMacro(raw[0], "SPACES") }
}

function extractAlias(body: YNodeSeq) {
  // Match the name in `Same as X' / `Same as `tt(X)' ` upstream forms.
  // `stripYodl` in code mode gives us the raw extracted text — no markdown
  // markup to disambiguate against.
  const m = stripYodl(body, "code").match(/\bSame as (?:`([^']*)'|([^.\s]+))/)
  const name = m?.[1] ?? m?.[2]
  return name ? mkDocumented("builtin", name) : undefined
}

function extractModule(body: YNodeSeq): string | undefined {
  return stripYodl(body, "code")
    .replace(/\s+/g, " ")
    .match(/\bThe (\S+) Module\b/)?.[1]
}
