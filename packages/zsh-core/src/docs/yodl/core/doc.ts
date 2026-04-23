import {
  isMacro,
  macroArg,
  parseNodes,
  type YNode,
  type YNodeSeq,
} from "./nodes.ts"
import { normalizeBody, stripYodl } from "./text.ts"

/**
 * Narrow a raw section/subsection string to a closed union, throwing on
 * unknown. Used by extractors that want to fail loud when upstream Yodl
 * introduces a new subsection name the type system hasn't been taught about.
 * Precedent: `parseOptionCategory` in options.ts.
 */
export function parseClosedUnion<T extends string>(
  raw: string,
  set: ReadonlySet<string>,
  label: string,
): T {
  if (set.has(raw)) return raw as T
  throw new Error(`Unknown ${label}: ${raw}`)
}

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

type YodlListKind = "item" | "sitem"

export interface AliasedYodlEntry<T> {
  head: T
  aliases: readonly T[]
  entry: YodlEntry
}

export function extractItems(
  src: string | YNodeSeq,
  depth?: number,
): YodlEntry[] {
  return extractEntries(asNodes(src), ["xitem", "item"], depth)
}

export function extractItemList(src: string | YNodeSeq): YodlEntry[] {
  return extractEntries(asNodes(src), ["xitem", "item"], 1)
}

export function extractSitemList(src: string | YNodeSeq): YodlEntry[] {
  return extractEntries(asNodes(src), ["sitem"], 1)
}

export function extractSections(src: string | YNodeSeq): YodlSection[] {
  const nodes = asNodes(src)
  const heads = nodes.flatMap((node, idx) =>
    isSection(node)
      ? [{ idx, level: node.name, name: stripYodl(macroArg(node, 0)) }]
      : [],
  )

  return heads.map((head, idx) => ({
    level: head.level,
    name: head.name,
    body: nodes.slice(head.idx + 1, heads[idx + 1]?.idx ?? nodes.length),
  }))
}

export function extractSectionBody(
  src: string | YNodeSeq,
  name: string,
): YNodeSeq {
  return extractSections(src).find(section => section.name === name)?.body ?? []
}

/**
 * Nodes under a top-level `sect(name)` — spanning its prose and any nested
 * `subsect(...)`-delimited bodies — up to (but excluding) the next top-level
 * `sect(...)`. Unlike `extractSectionBody`, this does not stop at subsections.
 */
export function extractSectBody(
  src: string | YNodeSeq,
  name: string,
): YNodeSeq {
  const nodes = asNodes(src)
  const start = nodes.findIndex(
    n => isMacro(n, "sect") && macroName(n) === name,
  )
  if (start < 0) return []
  const endRel = nodes.slice(start + 1).findIndex(n => isMacro(n, "sect"))
  const end = endRel < 0 ? nodes.length : start + 1 + endRel
  return nodes.slice(start + 1, end)
}

function macroName(node: YNode): string {
  return node.kind === "macro" ? stripYodl(macroArg(node, 0)) : ""
}

export function extractFirstList(
  src: string | YNodeSeq,
  kind: YodlListKind,
): YNodeSeq | undefined {
  const nodes = asNodes(src)
  const open = kind === "item" ? "startitem" : "startsitem"
  const close = kind === "item" ? "enditem" : "endsitem"
  let depth = 0
  let start = -1

  for (let idx = 0; idx < nodes.length; idx++) {
    const node = nodes[idx]
    if (isMacro(node, open)) {
      if (depth === 0) start = idx
      depth++
      continue
    }
    if (isMacro(node, close) && depth > 0) {
      depth--
      if (depth === 0 && start !== -1) return nodes.slice(start, idx + 1)
    }
  }

  return start === -1 ? undefined : nodes.slice(start)
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

function asNodes(src: string | YNodeSeq): YNodeSeq {
  return typeof src === "string" ? parseNodes(src) : src
}

function extractEntries(
  nodes: YNodeSeq,
  kinds: readonly YodlEntry["kind"][],
  depth?: number,
): YodlEntry[] {
  const out: YodlEntry[] = []
  let section = ""
  let itemDepth = 0
  let sitemDepth = 0

  for (const node of nodes) {
    if (isMacro(node, "sect") || isMacro(node, "subsect")) {
      section = stripYodl(macroArg(node, 0))
      continue
    }
    if (isMacro(node, "startitem")) {
      itemDepth++
      continue
    }
    if (isMacro(node, "enditem")) {
      itemDepth = Math.max(0, itemDepth - 1)
      continue
    }
    if (isMacro(node, "startsitem")) {
      sitemDepth++
      continue
    }
    if (isMacro(node, "endsitem")) {
      sitemDepth = Math.max(0, sitemDepth - 1)
      continue
    }
    if (node.kind !== "macro") continue
    if (!isEntry(node.name) || !kinds.includes(node.name)) continue

    const entryDepth = node.name === "sitem" ? sitemDepth : itemDepth
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

function isSection(
  node: YNode,
): node is Extract<YNode, { kind: "macro" }> & { name: "sect" | "subsect" } {
  return isMacro(node, "sect") || isMacro(node, "subsect")
}

function isEntry(name: string): name is YodlEntry["kind"] {
  return name === "item" || name === "sitem" || name === "xitem"
}
