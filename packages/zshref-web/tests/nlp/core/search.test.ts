// The embedder-agnostic pipeline around `rank`: the blank-query short-circuit,
// the embed text, the category set, the promote, the cut. Scores are the
// parity fixture's business.

import * as fcu from "@carlwr/fastcheck-utils"
import { allUnique, mapNonEmpty } from "@carlwr/typescript-extra"
import fc from "fast-check"
import { beforeAll, describe, expect, it } from "vitest"
import { lookupIndex } from "../../../nlp/core/lookup-map"
import type { Rules } from "../../../nlp/core/rules"
import {
  queryEmbedText,
  type SearchArgs,
  type SearchResult,
  search,
} from "../../../nlp/core/search"
import { recordKey } from "../../../nlp/core/types"
import { syntheticVec } from "../../../nlp/core/vec"
import { loadRulesYaml } from "../../../nlp/node/rules-load"
import { arbIndex, arbLookup, arbQuery, CATEGORIES } from "../../_arbs"
import { syntheticIndex } from "../../_fixtures"

const index = syntheticIndex([
  ["option", "autocd"],
  ["option", "glob"],
  ["builtin", "cd"],
  ["builtin", "echo"],
])
const lookup = lookupIndex({
  version: 1,
  entries: [{ raw: "AUTO_CD", category: "option", id: "autocd" }],
})
const embed = async (text: string) => syntheticVec(["query", text])

let rules: Rules
beforeAll(async () => {
  rules = await loadRulesYaml()
})

const run = (query: string, over: Partial<SearchArgs> = {}) =>
  search({
    query,
    embed,
    index,
    rules,
    lookup,
    limit: 10,
    categories: null,
    ...over,
  })
const keys = (r: SearchResult) => r.matches.map(m => recordKey(m.rec))

describe("search", () => {
  it("a blank query is the empty result, before any embed", async () => {
    const embed = () => Promise.reject(new Error("must not embed"))
    expect(await run("   ", { embed })).toEqual({ matches: [], total: 0 })
  })

  it("embeds the trimmed query's embed text", async () => {
    const seen: string[] = []
    await run("  glob qualifiers ", {
      embed: async t => {
        seen.push(t)
        return embed(t)
      },
    })
    expect(seen).toEqual([queryEmbedText("glob qualifiers", rules)])
  })

  it("the category set keeps exactly those; an empty set keeps nothing", async () => {
    const builtin = await run("cd", { categories: new Set(["builtin"]) })
    expect(keys(builtin).sort()).toEqual(["builtin/cd", "builtin/echo"])
    expect(builtin.total).toBe(2)
    expect((await run("cd", { categories: new Set() })).total).toBe(0)
  })

  it("the lookup hit takes slot 0; filtered out, it stays out", async () => {
    expect(keys(await run("AUTO_CD"))[0]).toBe("option/autocd")
    const builtin = await run("AUTO_CD", { categories: new Set(["builtin"]) })
    expect(keys(builtin)).not.toContain("option/autocd")
  })

  it("`limit` cuts the matches; `total` counts before the cut", async () => {
    const r = await run("cd", { limit: 1 })
    expect(r.matches).toHaveLength(1)
    expect(r.total).toBe(index.records.length)
  })
})

describe("search properties", () => {
  const arbArgs = arbIndex.chain(index =>
    fcu.record({
      index: fc.constant(index),
      lookup: arbLookup(index),
      query: fc.oneof(
        arbQuery,
        fcu.element(mapNonEmpty(index.records, r => ` ${r.text.id} `)),
      ),
      limit: fc.integer({ min: 0, max: 8 }),
      categories: fc.option(
        fc
          .uniqueArray(fcu.element(["x", ...CATEGORIES.map(c => c.category)]))
          .map(cs => new Set<string>(cs)),
        { nil: null },
      ),
    }),
  )

  it("total is the kept records' count, the matches its first `limit`, the lookup hit first when kept", async () => {
    await fc.assert(
      fc.asyncProperty(arbArgs, async a => {
        const r = await search({ ...a, embed, rules })
        const q = a.query.trim()
        const kept = a.index.records.filter(
          x => a.categories === null || a.categories.has(x.text.category),
        )
        if (q === "") {
          expect(r).toEqual({ matches: [], total: 0 })
          return
        }
        expect(r.total).toBe(kept.length)
        expect(r.matches).toHaveLength(Math.min(a.limit, kept.length))
        const hit = a.lookup.lookup(q)
        const hitKept =
          hit && kept.some(x => recordKey(x.text) === recordKey(hit))
        if (hitKept && a.limit > 0) expect(keys(r)[0]).toBe(recordKey(hit))
        // Every match is a kept record, each at most once.
        const ks = keys(r)
        expect(allUnique(ks)).toBe(true)
        for (const k of ks)
          expect(kept.map(x => recordKey(x.text))).toContain(k)
      }),
      { numRuns: 60 },
    )
  })
})
