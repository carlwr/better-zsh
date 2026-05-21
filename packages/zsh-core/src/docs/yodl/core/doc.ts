import {
  asNodes,
  isMacro,
  macroArg,
  type YNodeSeq,
  type YodlSrc,
} from "./nodes.ts"
import { normalizeBody, stripYodl } from "./text.ts"

/**
 * Closure that narrows a raw section/subsection string to a member of `values`
 * — throwing on unknown so extractors fail loud when upstream Yodl introduces
 * a subsection name the type system hasn't been taught about.
 */
export function mkClosedUnionParser<T extends string>(
  values: readonly T[],
  label: string,
): (raw: string) => T {
  const set: ReadonlySet<string> = new Set(values)
  return raw => {
    if (set.has(raw)) return raw as T
    throw new Error(`Unknown ${label}: ${raw}`)
  }
}

type YodlListKind = "item" | "sitem"

export interface YodlEntry {
  kind: "item" | "sitem" | "xitem"
  header: YNodeSeq
  body?: YNodeSeq
  section: string
  depth: number
}

export interface YodlSection {
  level: "sect" | "subsect"
  name: string
  body: YNodeSeq
}

export interface AliasedYodlEntry<T> {
  head: T
  aliases: readonly T[]
  entry: YodlEntry
}

export function extractItems(src: YodlSrc, depth?: number): YodlEntry[] {
  return extractEntries(asNodes(src), ["xitem", "item"], depth)
}

/** Narrow a list of entries to those carrying a body. Type-guarded. */
export function withBody(
  entries: readonly YodlEntry[],
): (YodlEntry & { body: YNodeSeq })[] {
  return entries.filter(
    (e): e is YodlEntry & { body: YNodeSeq } => e.body !== undefined,
  )
}

/** Convenience: only the top-level (depth-1) `item`/`xitem` entries. */
export function extractItemList(src: YodlSrc): YodlEntry[] {
  return extractItems(src, 1)
}

/**
 * Three-way split of an item-body at its first depth-1
 * `startitem()`/`enditem()` block.
 *
 * - `intro`  — body nodes before the nested list (still as Yodl nodes)
 * - `entries` — the depth-1 list's `item`/`xitem` entries
 * - `outro` — body nodes after the matching `enditem()`
 *
 * Returns `undefined` when no nested list is present; the caller should
 * treat the whole body as flat prose.
 *
 * Only the immediate level is structured. Deeper nesting inside an entry's
 * body stays inside that entry and will flatten through `normalizeBody`
 * when the caller renders the entry. Lifting nested structure further is
 * a separate operation (call `splitBodyAtNestedList` again on the entry's
 * body if needed).
 */
export interface ItemBodySplit {
  readonly intro: YNodeSeq
  readonly entries: readonly YodlEntry[]
  readonly outro: YNodeSeq
}

export function splitBodyAtNestedList(
  body: YNodeSeq,
): ItemBodySplit | undefined {
  const range = findBracketRange(body, "startitem", "enditem")
  if (!range) return undefined
  return {
    intro: body.slice(0, range.start),
    entries: extractItemList(body.slice(range.start, range.end + 1)),
    outro: body.slice(range.end + 1),
  }
}

/**
 * Generalization of `splitBodyAtNestedList` over every sibling
 * `startitem()`/`enditem()` block in `body`. Returns the leading prose, each
 * captured list with the inter-list prose immediately preceding it, and the
 * trailing prose after the final list. Returns `undefined` when the body has
 * no nested list — callers can then keep the body as flat prose.
 *
 * Used by extractors whose record body may carry multiple sibling nested
 * lists (e.g. `typeset`, `_arguments`). The first group's `preIntro` is
 * always the empty sequence — the body's intro is exposed separately so the
 * caller can place it before the first group in the rendered output.
 */
export interface BodyWithNestedLists {
  readonly intro: YNodeSeq
  readonly groups: readonly {
    readonly preIntro: YNodeSeq
    readonly entries: readonly YodlEntry[]
  }[]
  readonly outro: YNodeSeq
}

export function splitBodyAtAllNestedLists(
  body: YNodeSeq,
): BodyWithNestedLists | undefined {
  const first = splitBodyAtNestedList(body)
  if (!first) return undefined
  const groups: BodyWithNestedLists["groups"][number][] = [
    { preIntro: [], entries: first.entries },
  ]
  let cursor: ItemBodySplit = first
  while (true) {
    const next = splitBodyAtNestedList(cursor.outro)
    if (!next) break
    groups.push({ preIntro: next.intro, entries: next.entries })
    cursor = next
  }
  return { intro: first.intro, groups, outro: cursor.outro }
}

/**
 * Locate the first balanced top-level `open()` / `close()` pair in `nodes`,
 * returning the indices of the opener and matching closer. Nested pairs of
 * the same kind nest by depth count. Returns `undefined` if no balanced
 * pair exists.
 */
function findBracketRange(
  nodes: YNodeSeq,
  open: string,
  close: string,
): { start: number; end: number } | undefined {
  let depth = 0
  let start = -1
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (isMacro(node, open)) {
      if (depth === 0) start = i
      depth++
      continue
    }
    if (isMacro(node, close) && depth > 0) {
      depth--
      if (depth === 0 && start !== -1) return { start, end: i }
    }
  }
  return undefined
}

/**
 * The depth-1 `item`/`xitem` entries inside the first
 * `startitem()`/`enditem()` block of `src`. Empty when no such block exists
 * (matches the historical "guard the list, iterate it" pattern in extractors).
 */
export function extractFirstItemList(src: YodlSrc): YodlEntry[] {
  return extractFirstList(src, "item", ["xitem", "item"])
}

/**
 * The depth-1 `sitem` entries inside the first
 * `startsitem()`/`endsitem()` block of `src`. Empty when no such block exists.
 */
export function extractFirstSitemList(src: YodlSrc): YodlEntry[] {
  return extractFirstList(src, "sitem", ["sitem"])
}

export function extractSections(src: YodlSrc): YodlSection[] {
  const nodes = asNodes(src)
  const heads = nodes.flatMap((node, idx) =>
    isMacro(node, "sect") || isMacro(node, "subsect")
      ? [{ idx, level: node.name, name: stripYodl(macroArg(node, 0), "code") }]
      : [],
  )
  return heads.map((head, idx) => ({
    level: head.level,
    name: head.name,
    body: nodes.slice(head.idx + 1, heads[idx + 1]?.idx ?? nodes.length),
  }))
}

export function extractSectionBody(src: YodlSrc, name: string): YNodeSeq {
  return extractSections(src).find(s => s.name === name)?.body ?? []
}

/**
 * Nodes under a top-level `sect(name)` — spanning its prose and any nested
 * `subsect(...)`-delimited bodies — up to (but excluding) the next top-level
 * `sect(...)`. Unlike `extractSectionBody`, this does not stop at subsections.
 */
export function extractSectBody(src: YodlSrc, name: string): YNodeSeq {
  const nodes = asNodes(src)
  const start = nodes.findIndex(
    n => isMacro(n, "sect") && stripYodl(macroArg(n, 0), "code") === name,
  )
  if (start < 0) return []
  const after = start + 1
  const endRel = nodes.slice(after).findIndex(n => isMacro(n, "sect"))
  return nodes.slice(after, endRel < 0 ? nodes.length : after + endRel)
}

const LIST_BRACKETS = {
  item: { open: "startitem", close: "enditem" },
  sitem: { open: "startsitem", close: "endsitem" },
} as const satisfies Record<YodlListKind, { open: string; close: string }>

function extractFirstList(
  src: YodlSrc,
  kind: YodlListKind,
  entryKinds: readonly YodlEntry["kind"][],
): YodlEntry[] {
  const nodes = asNodes(src)
  const { open, close } = LIST_BRACKETS[kind]
  const range = findBracketRange(nodes, open, close)
  if (range) {
    return extractEntries(
      nodes.slice(range.start, range.end + 1),
      entryKinds,
      1,
    )
  }
  // Unbalanced: take the tail from the first opener if any (matches the
  // historical behavior of the inline walker).
  const openIdx = nodes.findIndex(n => isMacro(n, open))
  return openIdx === -1
    ? []
    : extractEntries(nodes.slice(openIdx), entryKinds, 1)
}

export function flattenAliasedEntries<T, U>(
  entries: readonly YodlEntry[],
  parseHeader: (header: YodlEntry["header"]) => T | undefined,
  toDoc: (head: T, desc: string, entry: YodlEntry) => U,
): U[] {
  const out: U[] = []
  for (const entry of collectAliasedEntries(entries, parseHeader)) {
    const desc = normalizeBody(entry.entry.body ?? [])
    out.push(toDoc(entry.head, desc, entry.entry))
    for (const alias of entry.aliases) out.push(toDoc(alias, desc, entry.entry))
  }
  return out
}

export function collectAliasedEntries<T>(
  entries: readonly YodlEntry[],
  parseHeader: (header: YodlEntry["header"]) => T | undefined,
): AliasedYodlEntry<T>[] {
  const out: AliasedYodlEntry<T>[] = []
  let pending: T[] = []

  for (const entry of entries) {
    const head = parseHeader(entry.header)
    if (!head) {
      pending = []
      continue
    }
    if (!entry.body) {
      pending.push(head)
      continue
    }
    out.push({ head, aliases: pending, entry })
    pending = []
  }

  return out
}

/**
 * Maps every list-bracket macro to the list family it bounds and the depth
 * delta it applies. Derived from `LIST_BRACKETS` so adding a list kind is one
 * edit. `extractEntries` walks these to track current nesting depth per
 * family without parallel counters.
 */
const BRACKET_FAMILY: Readonly<
  Record<string, readonly [YodlListKind, 1 | -1]>
> = Object.fromEntries(
  (
    Object.entries(LIST_BRACKETS) as readonly [
      YodlListKind,
      { open: string; close: string },
    ][]
  ).flatMap(([k, b]) => [
    [b.open, [k, 1] as const],
    [b.close, [k, -1] as const],
  ]),
)

function entryFamily(name: YodlEntry["kind"]): YodlListKind {
  return name === "sitem" ? "sitem" : "item"
}

function extractEntries(
  nodes: YNodeSeq,
  kinds: readonly YodlEntry["kind"][],
  depth?: number,
): YodlEntry[] {
  const out: YodlEntry[] = []
  let section = ""
  const depths: Record<YodlListKind, number> = { item: 0, sitem: 0 }

  for (const node of nodes) {
    if (node.kind !== "macro") continue
    if (node.name === "sect" || node.name === "subsect") {
      section = stripYodl(macroArg(node, 0), "code")
      continue
    }
    const bracket = BRACKET_FAMILY[node.name]
    if (bracket) {
      const [family, delta] = bracket
      depths[family] = Math.max(0, depths[family] + delta)
      continue
    }
    if (!isEntryKind(node.name) || !kinds.includes(node.name)) continue

    const entryDepth = depths[entryFamily(node.name)]
    if (depth !== undefined && entryDepth !== depth) continue

    out.push({
      kind: node.name,
      header: macroArg(node, 0),
      body: node.name === "xitem" ? undefined : macroArg(node, 1),
      section,
      depth: entryDepth,
    })
  }

  return out
}

function isEntryKind(name: string): name is YodlEntry["kind"] {
  return name === "item" || name === "sitem" || name === "xitem"
}
