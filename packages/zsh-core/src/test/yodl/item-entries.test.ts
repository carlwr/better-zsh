/**
 * Nested item lists: no producer loses a header or a line of prose, and no
 * corpus entry holds an alias chain as one joined string. Lost text leaves
 * nothing behind to assert on — hence generated input, whose answer is known.
 */

import { describe, expect, test } from "vitest"
import { loadCorpus } from "../../docs/corpus"
import { docCategories } from "../../docs/taxonomy"
import type { ItemEntry } from "../../docs/types"
import { asNodes } from "../../docs/yodl/core/nodes"
import { splitFlagBody } from "../../docs/yodl/extractors/flag-section"
import { splitParamBody } from "../../docs/yodl/extractors/param-keys"
import { parseZleWidgets } from "../../docs/yodl/extractors/zle-widgets"

// --- alias folding: every arrangement, every producer ----------------------

// A list written as a pattern string, one character per entry:
const ALIAS = "x" // a body-less `xitem` header
const BODIED = "i" // an `item(...)(body)`

/** Every pattern of length 1..`max`. */
const arrangements = (max: number): readonly string[] =>
  max === 0
    ? []
    : [ALIAS, BODIED].flatMap(c => [
        c,
        ...arrangements(max - 1).map(p => c + p),
      ])

const head = (k: number) => `h${k}`
const desc = (k: number) => `Body of ${head(k)}.`
const line = (sigs: readonly string[], body: string) =>
  `${sigs.join(" ")}: ${body}`

/** One `startitem()` list; entries are numbered from `from`. */
const listLines = (pattern: string, from = 0): string[] => [
  "startitem()",
  ...[...pattern].flatMap((kind, i) =>
    kind === ALIAS
      ? [`xitem(tt(${head(from + i)}))`]
      : [`item(tt(${head(from + i)}))(`, desc(from + i), ")"],
  ),
  "enditem()",
]

const listYo = (pattern: string): string =>
  ["Intro prose.", "", ...listLines(pattern)].join("\n")

/** What the list must yield: each alias run folded onto the entry after it. */
const expected = (pattern: string): string[] => {
  const out: string[] = []
  let aliases: string[] = []
  for (const [k, kind] of [...pattern].entries()) {
    if (kind === ALIAS) {
      aliases.push(head(k))
      continue
    }
    out.push(line([...aliases, head(k)], desc(k)))
    aliases = []
  }
  return out // trailing aliases have no body to fold onto
}

const summary = (entries: readonly ItemEntry[]): string[] =>
  entries.map(e => line(e.sigs, e.desc))

// Only reachable through the section walk, unlike the other two.
const widgetRecord = (body: string): unknown =>
  parseZleWidgets(
    [
      "sect(Standard Widgets)",
      "subsect(Movement)",
      "startitem()",
      "item(tt(a-widget))(",
      body,
      ")",
      "enditem()",
      "sect(Character Highlighting)",
    ].join("\n"),
  )[0]

const widgetSubItems = (body: string): readonly ItemEntry[] =>
  (widgetRecord(body) as { subItems?: readonly ItemEntry[] }).subItems ?? []

const producers: readonly (readonly [
  string,
  (body: string) => readonly ItemEntry[],
  (body: string) => unknown,
])[] = [
  [
    "flag groups",
    b => splitFlagBody(asNodes(b)).flagGroups?.flatMap(g => g.flags) ?? [],
    b => splitFlagBody(asNodes(b)),
  ],
  [
    "parameter keys",
    b => splitParamBody(asNodes(b)).keys ?? [],
    b => splitParamBody(asNodes(b)),
  ],
  ["widget sub-items", widgetSubItems, widgetRecord],
]

// A body of prose and sibling lists; every list may be empty or alias-only,
// i.e. yield no rows.
const prose = (k: number) => `Prose ${k}.`
const listPatterns = ["", ...arrangements(2)]
const layouts = (max: number): readonly (readonly string[])[] =>
  max === 0
    ? []
    : listPatterns.flatMap(p => [
        [p],
        ...layouts(max - 1).map(ps => [p, ...ps]),
      ])

const layoutYo = (lists: readonly string[]): string => {
  let from = 0
  const lines = lists.flatMap((pattern, k) => {
    const ls = [prose(k), "", ...listLines(pattern, from), ""]
    from += pattern.length
    return ls
  })
  return [...lines, prose(lists.length)].join("\n")
}

/** Texts the output must hold: all prose, and each bodied entry's body. */
const mustKeep = (lists: readonly string[]): string[] => {
  let from = 0
  const bodies = lists.flatMap(pattern => {
    const ds = [...pattern].flatMap((kind, i) =>
      kind === BODIED ? [desc(from + i)] : [],
    )
    from += pattern.length
    return ds
  })
  return [...lists.map((_, k) => prose(k)), prose(lists.length), ...bodies]
}

/** Every string inside `node`, at any depth. */
function* strings(node: unknown): Generator<string> {
  if (typeof node === "string") yield node
  else if (typeof node === "object" && node !== null)
    for (const v of Object.values(node)) yield* strings(v)
}

describe.each(producers)(
  "nested item list — %s",
  (_label, entriesOf, recOf) => {
    test("no arrangement of `xitem` / `item` loses a header", () => {
      const wrong = arrangements(5).flatMap(pattern => {
        const got = summary(entriesOf(listYo(pattern)))
        const want = expected(pattern)
        return got.join(" | ") === want.join(" | ")
          ? []
          : [{ pattern, got, want }]
      })
      expect(wrong).toEqual([])
    })

    test("no arrangement of prose and lists loses text", () => {
      const wrong = layouts(3).flatMap(lists => {
        const out = [...strings(recOf(layoutYo(lists)))].join("\n")
        const lost = mustKeep(lists).filter(t => !out.includes(t))
        return lost.length === 0 ? [] : [{ lists, lost }]
      })
      expect(wrong).toEqual([])
    })
  },
)

// --- corpus-wide entry shape -----------------------------------------------

/** Every `ItemEntry`-shaped value inside `node`, at any depth. */
function* itemEntries(node: unknown): Generator<ItemEntry> {
  if (Array.isArray(node)) {
    for (const v of node) yield* itemEntries(v)
    return
  }
  if (typeof node !== "object" || node === null) return
  const obj = node as Record<string, unknown>
  if (Array.isArray(obj.sigs) && typeof obj.desc === "string") {
    yield obj as unknown as ItemEntry
  }
  for (const v of Object.values(obj)) yield* itemEntries(v)
}

describe("every nested item list in the corpus", () => {
  const corpus = loadCorpus()
  const entries = docCategories.flatMap(cat =>
    [...corpus[cat].values()].flatMap(rec => [...itemEntries(rec)]),
  )

  test("several categories carry one", () => {
    expect(entries.length).toBeGreaterThan(100)
  })

  test("every sig is one trimmed, non-blank header", () => {
    for (const { sigs } of entries) {
      expect(sigs.length).toBeGreaterThan(0)
      for (const sig of sigs) {
        expect(sig).toBe(sig.trim())
        expect(sig).not.toBe("")
        expect(sig).not.toContain(",") // an alias chain is `sigs`, not a join
      }
    }
  })
})
