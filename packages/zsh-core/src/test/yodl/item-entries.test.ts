/**
 * The nested item list, wherever a record body carries one.
 *
 * Two layers: every producer folds a body-less `xitem` head onto the
 * `item(...)(body)` that terminates the chain, and no entry anywhere in the
 * corpus encodes such a chain as one joined string. The bug both pin: a
 * producer that walked raw entries and skipped the body-less ones, silently
 * dropping every `xitem` alias in its category.
 */

import { describe, expect, test } from "vitest"
import { loadCorpus } from "../../docs/corpus"
import { docCategories } from "../../docs/taxonomy"
import type { ItemEntry } from "../../docs/types"
import { asNodes } from "../../docs/yodl/core/nodes"
import { splitFlagBody } from "../../docs/yodl/extractors/flag-section"
import { splitParamBody } from "../../docs/yodl/extractors/param-keys"
import { parseZleWidgets } from "../../docs/yodl/extractors/zle-widgets"

// --- alias folding, once per nested-list producer ---------------------------

// A record body: intro prose, then a list whose first entry is an `xitem`
// alias chain (`%t` has no body of its own — upstream means it as a synonym
// of `%@`) and whose second stands alone.
const body = [
  "Intro prose.",
  "",
  "startitem()",
  "xitem(tt(%t))",
  "item(tt(%@))(",
  "The time, in 12-hour, am/pm format.",
  ")",
  "item(tt(%T))(",
  "The time, in 24-hour format.",
  ")",
  "enditem()",
].join("\n")

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
  const entries = entriesOf(body)

  test("the `xitem` head folds onto the entry carrying the body", () => {
    expect(entries.map(e => e.sigs)).toEqual([["%t", "%@"], ["%T"]])
  })

  test("the folded heads share one desc", () => {
    expect(entries[0]?.desc).toBe("The time, in 12-hour, am/pm format.")
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
