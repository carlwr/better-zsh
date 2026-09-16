// The embedder-agnostic pipeline around `rank`: the blank-query short-circuit,
// the embed text, the category set, the promote, the cut. Scores are the
// parity fixture's business.

import { beforeAll, describe, expect, it } from "vitest"
import { LookupIndex } from "../../../nlp/core/lookup-map"
import type { Rules } from "../../../nlp/core/rules"
import {
  queryEmbedText,
  type SearchArgs,
  type SearchResult,
  search,
} from "../../../nlp/core/search"
import { syntheticVec } from "../../../nlp/node/fixtures"
import { loadRulesYaml } from "../../../nlp/node/rules-load"
import { syntheticIndex } from "../../_fixtures"

const index = syntheticIndex([
  ["option", "autocd"],
  ["option", "glob"],
  ["builtin", "cd"],
  ["builtin", "echo"],
])
const lookup = new LookupIndex({
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
const keys = (r: SearchResult) =>
  r.matches.map(m => `${m.rec.category}/${m.rec.id}`)

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
