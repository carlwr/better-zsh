// The Node wrapper's own claims — what it adds around the core pipeline
// (`tests/nlp/core/search.test.ts`): the category narrowing, the defaults.

import { beforeAll, describe, expect, it } from "vitest"
import { LookupIndex } from "../../../nlp/core/lookup-map"
import { syntheticVec } from "../../../nlp/node/fixtures"
import { loadRulesYaml } from "../../../nlp/node/rules-load"
import { type SearchDeps, searchNode } from "../../../nlp/node/search-node"
import { syntheticIndex } from "../../_fixtures"

const ids = ["a", "b", "c", "d", "e", "f"]
const index = syntheticIndex([
  ...ids.map(id => ["option", id] as const),
  ...ids.map(id => ["builtin", id] as const),
])

let deps: SearchDeps
beforeAll(async () => {
  deps = {
    index,
    rules: await loadRulesYaml(),
    lookup: new LookupIndex({ version: 1, entries: [] }),
    embedder: {
      embed: async texts => texts.map(t => syntheticVec(["query", t])),
    },
  }
})

describe("searchNode", () => {
  it("default limit 10; total counts every record", async () => {
    const out = await searchNode({ query: "setopt" }, deps)
    expect(out.matches).toHaveLength(10)
    expect(out.total).toBe(index.records.length)
  })

  it("`category` keeps that category", async () => {
    const out = await searchNode({ query: "setopt", category: "builtin" }, deps)
    expect(out.total).toBe(ids.length)
    expect(out.matches.every(m => m.rec.category === "builtin")).toBe(true)
  })

  it("rejects an unknown category", async () => {
    await expect(
      searchNode({ query: "setopt", category: "nope" }, deps),
    ).rejects.toThrow(/unknown category/)
  })
})
