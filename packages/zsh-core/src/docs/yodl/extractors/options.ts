import { isNonEmpty } from "@carlwr/typescript-extra"

import { mkDocumented } from "../../brands.ts"
import type {
  DefaultMarker,
  Documented,
  Emulation,
  OptFlag,
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
  type YodlEntry,
} from "../core/doc.ts"
import { asNodes, type YodlSrc } from "../core/nodes.ts"
import {
  firstTt,
  normalizeBody,
  stripYodl,
  trimmedTtTexts,
} from "../core/text.ts"

const DEFAULT_EMULATIONS: Record<DefaultMarker, readonly Emulation[]> = {
  C: ["csh"],
  D: emulations,
  K: ["ksh"],
  S: ["sh"],
  Z: ["zsh"],
}
// Marker char class derived from the table — can't drift from `DefaultMarker`.
const MARKER_CHARS = Object.keys(DEFAULT_EMULATIONS).join("")
const DEFAULT_RE = new RegExp(`<([${MARKER_CHARS}])>`, "g")

/**
 * zsh's two single-letter option tables — each an sitem list under "Single
 * Letter Options" in options.yo — and the emulation modes each serves.
 * Option headers repeat the letters: a plain one from the default table, a
 * `ksh:`-prefixed one from the sh/ksh table.
 */
const FLAG_TABLES = {
  default: { section: "Default set", emulations: ["csh", "zsh"] },
  ksh: { section: "sh/ksh emulation set", emulations: ["ksh", "sh"] },
} as const satisfies Record<
  string,
  { section: string; emulations: readonly Emulation[] }
>
type FlagTable = (typeof FLAG_TABLES)[keyof typeof FLAG_TABLES]

const FLAG_TOKEN = "[+-][A-Za-z0-9]"
const FLAG_TOKEN_RE = new RegExp(`^${FLAG_TOKEN}$`)
// Option header as plain text: `NAME[ (FLAG[, ksh: FLAG])][ <M>…]`, e.g.
// `NOTIFY (-5, ksh: -b) <Z>`. Any other shape is an upstream change to be
// taught here, never silently dropped.
const HEADER_RE = new RegExp(
  `^(?<name>[A-Z_]+)` +
    `(?: \\((?<flag>${FLAG_TOKEN})(?:, ksh: (?<kshFlag>${FLAG_TOKEN}))?\\))?` +
    `(?: <[${MARKER_CHARS}]>)*$`,
)

const parseOptionSection = mkClosedUnionParser(
  optSections,
  "zsh option section",
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
  const tableFlags = parseFlagTables(nodes)
  return withBody(extractItems(nodes)).map(item => {
    const head = parseOptHeader(item.header)
    const section = parseOptionSection(item.section)
    const aliasOf =
      section === "Option Aliases" ? parseAliasTarget(item.body) : undefined
    return {
      name: head.name,
      display: head.display,
      flags: mergeFlags([...head.flags, ...(tableFlags.get(head.name) ?? [])]),
      defaultIn: head.defaultIn,
      section,
      desc: normalizeBody(item.body),
      ...(aliasOf && { aliasOf }),
    } satisfies ZshOption
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

function parseOptHeader(header: YodlSrc): {
  name: Documented<"option">
  display: string
  flags: OptFlagAlias[]
  defaultIn: readonly Emulation[]
} {
  const text = stripYodl(header, "code")
  const m = HEADER_RE.exec(text)?.groups
  if (!m?.name) throw new Error(`Unexpected zsh option header: ${text}`)
  return {
    name: mkDocumented("option", m.name),
    display: m.name,
    flags: [
      ...headerFlag(m.flag, FLAG_TABLES.default),
      ...headerFlag(m.kshFlag, FLAG_TABLES.ksh),
    ],
    defaultIn: emulationsFor(defaultMarkers(text)),
  }
}

function headerFlag(
  token: string | undefined,
  table: FlagTable,
): OptFlagAlias[] {
  const flag = token === undefined ? undefined : parseFlagToken(token)
  return flag ? [mkAlias(flag.char, flag.on, table.emulations)] : []
}

/** Rows of both tables, keyed by the option they name. */
function parseFlagTables(
  yo: YodlSrc,
): Map<Documented<"option">, readonly OptFlagAlias[]> {
  const out = new Map<Documented<"option">, readonly OptFlagAlias[]>()
  for (const table of Object.values(FLAG_TABLES)) {
    const rows = extractFirstSitemList(extractSectionBody(yo, table.section))
    for (const row of rows) {
      const { name, alias } = parseTableRow(row, table)
      out.set(name, [...(out.get(name) ?? []), alias])
    }
  }
  return out
}

// A row is `sitem(tt(-X))(NAME)` or `sitem(tt(-X))(em(NO_)NAME)`; the latter
// says `-X` turns NAME off, i.e. `+X` is the on-form.
function parseTableRow(
  row: YodlEntry,
  table: FlagTable,
): { name: Documented<"option">; alias: OptFlagAlias } {
  const token = trimmedTtTexts(row.header)[0]
  const flag = token === undefined ? undefined : parseFlagToken(token)
  const target = stripYodl(row.body ?? "", "code").trim()
  if (!flag || !target) {
    throw new Error(
      `Unexpected "${table.section}" row: ${stripYodl(row.header)}`,
    )
  }
  const negated = target.startsWith("NO_")
  return {
    name: mkDocumented("option", target.replace(/^NO_/, "")),
    alias: mkAlias(
      flag.char,
      negated ? flipOptFlagSign(flag.on) : flag.on,
      table.emulations,
    ),
  }
}

/** Parse a `+X`/`-X` flag token; the sole `OptFlagSign` narrowing point. */
function parseFlagToken(
  token: string,
): { char: OptFlag; on: OptFlagSign } | undefined {
  if (!FLAG_TOKEN_RE.test(token)) return undefined
  return { char: mkOptFlag(token.slice(1)), on: token[0] as OptFlagSign }
}

/**
 * The sole `OptFlagAlias` constructor: one key order for every source (the
 * JSON export shows it), `emulations` deduped in `emulations` tuple order.
 */
function mkAlias(
  char: OptFlag,
  on: OptFlagSign,
  validIn: readonly Emulation[],
): OptFlagAlias {
  const kept = emulations.filter(e => validIn.includes(e))
  if (!isNonEmpty(kept))
    throw new Error(`option flag ${on}${char}: no emulation`)
  return { char, on, emulations: kept }
}

const isZshAlias = (alias: OptFlagAlias) => alias.emulations.includes("zsh")

/**
 * Same `(on, char)` from several sources (header, tables) is one alias valid
 * in the union of their emulations. Plain-zsh aliases come first.
 */
function mergeFlags(aliases: readonly OptFlagAlias[]): OptFlagAlias[] {
  const out: OptFlagAlias[] = []
  for (const a of aliases) {
    const i = out.findIndex(b => b.on === a.on && b.char === a.char)
    const prev = out[i]
    if (prev) {
      out[i] = mkAlias(a.char, a.on, [...prev.emulations, ...a.emulations])
    } else {
      out.push(a)
    }
  }
  return [...out.filter(isZshAlias), ...out.filter(a => !isZshAlias(a))]
}

function defaultMarkers(header: string): DefaultMarker[] {
  return [...header.matchAll(DEFAULT_RE)].flatMap(m =>
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
