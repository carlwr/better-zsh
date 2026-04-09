import type { ShellParamDoc } from "../../types/zsh-data.ts"
import {
  extractFirstList,
  extractItemList,
  extractSectionBody,
} from "../core/doc.ts"
import { extractTokens, normalizeBody, stripYodl } from "../core/text.ts"

const PARAM_SECTIONS = [
  "Parameters Set By The Shell",
  "Parameters Used By The Shell",
] as const

interface ParamHead {
  name: string
  tied?: string
}

export function parseShellParams(yo: string): ShellParamDoc[] {
  return PARAM_SECTIONS.flatMap((section) => parseParamSection(yo, section))
}

function parseParamSection(
  yo: Parameters<typeof extractFirstList>[0],
  section: (typeof PARAM_SECTIONS)[number],
) {
  const list = extractFirstList(extractSectionBody(yo, section), "item")
  if (!list) return []

  const items = extractItemList(list)
  const out: ShellParamDoc[] = []
  let pending: ParamHead[] = []

  for (const item of items) {
    const heads = parseHeads(item.header)
    if (heads.length === 0) {
      pending = []
      continue
    }
    if (!item.body) {
      pending.push(...heads)
      continue
    }

    const desc = normalizeBody(item.body)
    for (const head of [...heads, ...pending]) {
      out.push({
        name: head.name,
        sig: head.name,
        desc,
        section,
        ...(head.tied && { tied: head.tied }),
      })
    }
    pending = []
  }

  return out
}

function parseHeads(header: Parameters<typeof extractTokens>[0]): ParamHead[] {
  const names = extractTokens(header)
    .filter((tok) => tok.kind === "tt")
    .map((tok) => tok.text.trim())
    .filter(Boolean)

  const [name, tied] = names
  if (!name) return []
  if (
    !tied ||
    !new RegExp(`\\(${escapeRe(tied)}(?:\\s|\\))`).test(stripYodl(header))
  )
    return [{ name }]

  return [
    { name, tied },
    { name: tied, tied: name },
  ]
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
