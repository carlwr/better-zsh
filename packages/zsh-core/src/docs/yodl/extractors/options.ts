import { mkDocumented } from "../../brands.ts"
import type {
  DefaultMarker,
  Documented,
  Emulation,
  OptFlagAlias,
  OptFlagSign,
  OptSection,
  ZshOption,
} from "../../types.ts"
import { mkOptFlag, optSections } from "../../types.ts"
import {
  extractFirstList,
  extractItems,
  extractSectionBody,
  extractSitemList,
} from "../core/doc.ts"
import { parseNodes } from "../core/nodes.ts"
import { extractTokens, normalizeBody, stripYodl } from "../core/text.ts"

const DEFAULT_RE = /<([DKSCZ])>/g
const HEADER_FLAG_RE = /^[+-][A-Za-z0-9]$/
const ALL_EMULATIONS: readonly Emulation[] = ["csh", "ksh", "sh", "zsh"]
const DEFAULT_EMULATIONS: Record<DefaultMarker, readonly Emulation[]> = {
  C: ["csh"],
  D: ALL_EMULATIONS,
  K: ["ksh"],
  S: ["sh"],
  Z: ["zsh"],
}

const OPTION_SECTION_SET: ReadonlySet<string> = new Set(optSections)

/** Parse options.yo → ZshOption[] */
export function parseOptions(yo: string): readonly ZshOption[] {
  const nodes = parseNodes(yo)
  const items = extractItems(nodes)
  const flagMap = parseDefaultFlagAliases(nodes)
  return items.flatMap(item => {
    if (!item.body) return []
    const parsed = parseOptHeader(item.header)
    if (!parsed) return []
    return [
      {
        name: parsed.name,
        display: parsed.display,
        flags: mergeFlags(flagMap.get(parsed.name), parsed.flags),
        defaultIn: emulationsFor(defaultMarkers(item.header)),
        category: parseOptionCategory(item.section),
        desc: normalizeBody(item.body),
      } satisfies ZshOption,
    ]
  })
}

function parseOptionCategory(raw: string): OptSection {
  if (OPTION_SECTION_SET.has(raw)) return raw as OptSection
  throw new Error(`Unknown zsh option category: ${raw}`)
}

function parseOptHeader(header: Parameters<typeof extractTokens>[0]):
  | {
      name: Documented<"option">
      display: string
      flags: OptFlagAlias[]
    }
  | undefined {
  const [display, ...parts] = ttTexts(header)
  if (!display || !/^[A-Z_]+$/.test(display)) return undefined
  return {
    name: mkDocumented("option", display),
    display,
    flags: parts.flatMap(toFlagAlias),
  }
}

function parseDefaultFlagAliases(
  yo: Parameters<typeof extractItems>[0],
): Map<string, readonly OptFlagAlias[]> {
  const body = extractSectionBody(yo, "Default set")
  const list = extractFirstList(body, "sitem")
  const out = new Map<string, readonly OptFlagAlias[]>()
  if (!list) return out
  for (const item of extractSitemList(list)) {
    const flag = ttTexts(item.header)[0]
    const target = stripYodl(item.body ?? "").trim()
    if (!flag || !target) continue
    const alias = aliasFrom(flag, target)
    if (!alias) continue
    const key = mkDocumented("option", alias.display)
    out.set(key, mergeFlags(out.get(key), [alias.flag]))
  }
  return out
}

function ttTexts(raw: Parameters<typeof extractTokens>[0]): string[] {
  return extractTokens(raw)
    .filter(tok => tok.kind === "tt")
    .map(tok => tok.text.trim())
    .filter(Boolean)
}

function aliasFrom(
  flag: string,
  target: string,
): { display: string; flag: OptFlagAlias } | undefined {
  if (!HEADER_FLAG_RE.test(flag)) return undefined
  const listed = flag[0] as OptFlagSign
  const char = flag[1]
  if (!char) return undefined

  const positive = target.startsWith("NO_") ? opposite(listed) : listed
  const display = target.replace(/^NO_/, "")

  return {
    display,
    flag: {
      char: mkOptFlag(char),
      on: positive,
    },
  }
}

function opposite(sign: OptFlagSign): OptFlagSign {
  return sign === "-" ? "+" : "-"
}

function toFlagAlias(raw: string): OptFlagAlias[] {
  if (!HEADER_FLAG_RE.test(raw)) return []
  const on = raw[0] as OptFlagSign
  const char = raw[1]
  return char ? [{ char: mkOptFlag(char), on }] : []
}

function mergeFlags(
  ...groups: readonly (readonly OptFlagAlias[] | undefined)[]
): OptFlagAlias[] {
  const out: OptFlagAlias[] = []
  const seen = new Set<string>()
  for (const group of groups) {
    for (const flag of group ?? []) {
      const key = `${flag.on}${flag.char as string}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(flag)
    }
  }
  return out
}

function defaultMarkers(
  header: string | Parameters<typeof extractTokens>[0],
): DefaultMarker[] {
  const text = typeof header === "string" ? header : stripYodl(header)
  return [...text.matchAll(DEFAULT_RE)].flatMap(m =>
    m[1] ? [m[1] as DefaultMarker] : [],
  )
}

function emulationsFor(
  defaults: readonly DefaultMarker[],
): readonly Emulation[] {
  const out = new Set<Emulation>()
  for (const d of defaults)
    for (const emu of DEFAULT_EMULATIONS[d]) out.add(emu)
  return [...out]
}
