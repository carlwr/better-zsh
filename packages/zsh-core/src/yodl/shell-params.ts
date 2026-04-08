import type { ShellParamDoc } from "../types/zsh-data.ts"
import {
  extractFirstList,
  extractItemList,
  extractTokens,
  normalizeBody,
} from "./parse.ts"

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
  yo: string,
  section: (typeof PARAM_SECTIONS)[number],
) {
  const start = yo.indexOf(`sect(${section})`)
  if (start === -1) return []
  const list = extractFirstList(yo.slice(start), "item")
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

function parseHeads(header: string): ParamHead[] {
  const names = extractTokens(header)
    .filter((tok) => tok.kind === "tt")
    .map((tok) => tok.text.trim())
    .filter(Boolean)

  const [name, tied] = names
  if (!name) return []
  if (!tied || !header.includes("(tt(")) return [{ name }]

  return [
    { name, tied },
    { name: tied, tied: name },
  ]
}
