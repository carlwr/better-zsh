import { mkDocumented } from "../../brands.ts"
import type {
  DefaultMarker,
  Documented,
  Emulation,
  OptFlagAlias,
  OptFlagSign,
  ZshOption,
} from "../../types.ts"
import {
  emulations,
  flipOptFlagSign,
  mkOptFlag,
  optSections,
} from "../../types.ts"
import {
  extractFirstSitemList,
  extractItems,
  extractSectionBody,
  mkClosedUnionParser,
  withBody,
} from "../core/doc.ts"
import { asNodes, type YodlSrc } from "../core/nodes.ts"
import {
  firstTt,
  normalizeBody,
  stripYodl,
  trimmedTtTexts,
} from "../core/text.ts"

const HEADER_FLAG_RE = /^[+-][A-Za-z0-9]$/
const DEFAULT_EMULATIONS: Record<DefaultMarker, readonly Emulation[]> = {
  C: ["csh"],
  D: emulations,
  K: ["ksh"],
  S: ["sh"],
  Z: ["zsh"],
}
// Marker char class derived from the table — can't drift from `DefaultMarker`.
const DEFAULT_RE = new RegExp(
  `<([${Object.keys(DEFAULT_EMULATIONS).join("")}])>`,
  "g",
)

const parseOptionCategory = mkClosedUnionParser(
  optSections,
  "zsh option category",
)

/**
 * Pre-parse patch for a known upstream typo in options.yo. Removing becomes
 * a no-op once upstream fixes the typo.
 *
 * - GLOB_ASSIGN: `` `var(name)tt(=)var(pattern) `` missing its closing `'`,
 *   leaving an unclosed backtick-quote span that renders as a lone backtick.
 *
 * Exported so `loadCorpus` patches the shared file once; also applied here
 * for direct string callers (tests, one-off tools).
 */
export function fixupOptionsYo(yo: string): string {
  return yo.replace(
    "`var(name)tt(=)var(pattern) (e.g. `tt(foo=*)')",
    "`var(name)tt(=)var(pattern)' (e.g. `tt(foo=*)')",
  )
}

export function parseOptions(yo: YodlSrc): readonly ZshOption[] {
  const nodes = asNodes(typeof yo === "string" ? fixupOptionsYo(yo) : yo)
  const flagMap = parseDefaultFlagAliases(nodes)
  return withBody(extractItems(nodes)).flatMap(item => {
    const parsed = parseOptHeader(item.header)
    if (!parsed) return []
    const category = parseOptionCategory(item.section)
    const aliasOf =
      category === "Option Aliases" ? parseAliasTarget(item.body) : undefined
    return [
      {
        name: parsed.name,
        display: parsed.display,
        flags: mergeFlags(flagMap.get(parsed.name), parsed.flags),
        defaultIn: emulationsFor(defaultMarkers(item.header)),
        category,
        desc: normalizeBody(item.body),
        ...(aliasOf && { aliasOf }),
      } satisfies ZshOption,
    ]
  })
}

// Option-alias bodies are `em(NO_)tt(TARGET) (prose)` or `tt(TARGET) (prose)`.
// `em(NO_)` tokens render as `var` tokens via the yodl parser (em == var-style
// emphasis). The tt() is the target; the preceding em()/var() text signals
// negation.
function parseAliasTarget(body: YodlSrc): ZshOption["aliasOf"] {
  const target = firstTt(body)?.trim()
  if (!target) return undefined
  const negated = /\bNO_/.test(stripYodl(body))
  return {
    target: mkDocumented("option", target),
    negated,
  }
}

function parseOptHeader(header: YodlSrc):
  | {
      name: Documented<"option">
      display: string
      flags: OptFlagAlias[]
    }
  | undefined {
  const [display, ...parts] = trimmedTtTexts(header)
  if (!display || !/^[A-Z_]+$/.test(display)) return undefined
  return {
    name: mkDocumented("option", display),
    display,
    flags: parts.flatMap(toFlagAlias),
  }
}

function parseDefaultFlagAliases(
  yo: YodlSrc,
): Map<string, readonly OptFlagAlias[]> {
  const out = new Map<string, readonly OptFlagAlias[]>()
  for (const item of extractFirstSitemList(
    extractSectionBody(yo, "Default set"),
  )) {
    const flag = trimmedTtTexts(item.header)[0]
    const target = stripYodl(item.body ?? "", "code").trim()
    if (!flag || !target) continue
    const alias = aliasFrom(flag, target)
    if (!alias) continue
    const key = mkDocumented("option", alias.display)
    out.set(key, mergeFlags(out.get(key), [alias.flag]))
  }
  return out
}

/** Parse a `+X`/`-X` flag token into an alias; the sole `OptFlagSign` narrowing point. */
function parseFlagToken(s: string): OptFlagAlias | undefined {
  if (!HEADER_FLAG_RE.test(s)) return undefined
  const char = s[1]
  return char ? { on: s[0] as OptFlagSign, char: mkOptFlag(char) } : undefined
}

function aliasFrom(
  flag: string,
  target: string,
): { display: string; flag: OptFlagAlias } | undefined {
  const parsed = parseFlagToken(flag)
  if (!parsed) return undefined
  const negated = target.startsWith("NO_")
  return {
    display: target.replace(/^NO_/, ""),
    flag: {
      char: parsed.char,
      on: negated ? flipOptFlagSign(parsed.on) : parsed.on,
    },
  }
}

function toFlagAlias(raw: string): OptFlagAlias[] {
  const flag = parseFlagToken(raw)
  return flag ? [flag] : []
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

function defaultMarkers(header: YodlSrc): DefaultMarker[] {
  const text = typeof header === "string" ? header : stripYodl(header, "code")
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
