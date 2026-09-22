/**
 * The nested item list, wherever a record body carries one.
 *
 * Two layers: no producer loses a header for any arrangement of `xitem` and
 * `item`, and no entry anywhere in the corpus encodes an alias chain as one
 * joined string. The bug both pin: a producer that walked raw entries and
 * skipped the body-less ones, silently dropping every `xitem` alias in its
 * category. A drop leaves nothing behind to assert on, so the check runs
 * against generated input whose expected output is known.
 */

import { describe, expect, test } from "vitest"
import { loadCorpus } from "../../docs/corpus"
import { docCategories } from "../../docs/taxonomy"
import type { ItemEntry } from "../../docs/types"
import { asNodes } from "../../docs/yodl/core/nodes"
import { splitFlagBody } from "../../docs/yodl/extractors/flag-section"
import { splitParamBody } from "../../docs/yodl/extractors/param-keys"
import { parseZleWidgets } from "../../docs/yodl/extractors/zle-widgets"

// --- alias folding: every arrangement, every nested-list producer -----------

// One character per list entry: `x` a body-less `xitem` header, `i` an
// `item(...)(body)`. Exhaustive up to this length — long enough for runs of
// several aliases, several groups, and a chain in every position.
const PATTERNS: readonly string[] = Array.from({ length: 5 }, (_, i) => i + 1)
  .flatMap(len =>
    Array.from({ length: 1 << len }, (_, bits) =>
      Array.from({ length: len }, (_, k) => ((bits >> k) & 1 ? "i" : "x")),
    ),
  )
  .map(chars => chars.join(""))

const head = (k: number) => `h${k}`
const desc = (k: number) => `Body of ${head(k)}.`
const line = (sigs: readonly string[], body: string) =>
  `${sigs.join(" ")}: ${body}`

/** A record body: intro prose, then the list `pattern` describes. */
const listYo = (pattern: string): string =>
  [
    "Intro prose.",
    "",
    "startitem()",
    ...[...pattern].flatMap((kind, k) =>
      kind === "x"
        ? [`xitem(tt(${head(k)}))`]
        : [`item(tt(${head(k)}))(`, desc(k), ")"],
    ),
    "enditem()",
  ].join("\n")

/** What the list must yield: each `x` run folded onto the `i` after it. */
const expected = (pattern: string): string[] => {
  const out: string[] = []
  let pending: string[] = []
  for (const [k, kind] of [...pattern].entries()) {
    if (kind === "x") {
      pending.push(head(k))
      continue
    }
    out.push(line([...pending, head(k)], desc(k)))
    pending = []
  }
  // A trailing `x` run terminates nothing, so it has no body and no entry —
  // the one arrangement in which losing a header is correct.
  return out
}

const summary = (entries: readonly ItemEntry[]): string[] =>
  entries.map(e => line(e.sigs, e.desc))

// A ZLE widget's sub-items are only reachable through the section walk.
const widgetSubItems = (body: string): readonly ItemEntry[] =>
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
  )[0]?.subItems ?? []

const producers: readonly (readonly [
  string,
  (body: string) => readonly ItemEntry[],
])[] = [
  [
    "flag groups",
    b => splitFlagBody(asNodes(b)).flagGroups?.flatMap(g => g.flags) ?? [],
  ],
  ["parameter keys", b => splitParamBody(asNodes(b)).keys ?? []],
  ["widget sub-items", widgetSubItems],
]

describe.each(producers)("nested item list — %s", (_label, entriesOf) => {
  test("no arrangement of `xitem` / `item` loses a header", () => {
    const wrong = PATTERNS.flatMap(pattern => {
      const got = summary(entriesOf(listYo(pattern)))
      const want = expected(pattern)
      return got.join(" | ") === want.join(" | ")
        ? []
        : [{ pattern, got, want }]
    })
    expect(wrong).toEqual([])
  })
})

// --- corpus-wide entry shape ------------------------------------------------

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
        // an alias chain is what `sigs` is for — never one joined string
        expect(sig).not.toContain(",")
      }
    }
  })
})
