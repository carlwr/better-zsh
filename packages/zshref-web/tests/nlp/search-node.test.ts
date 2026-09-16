// The Node search runner's contract; the staged index and model are needed
// only for the two non-holdout queries. The numbers themselves are pinned by
// the parity and sanity fixtures, not here.

import { beforeAll, describe, expect, it } from "vitest"

import { createNodeEmbedder } from "../../nlp/embedder-node"
import { loadRulesYaml } from "../../nlp/rules-load"
import { type SearchDeps, searchNode } from "../../nlp/search-node"
import { loadVectorIndex } from "../../src/lib/ranker/index-loader"
import { LookupIndex, LookupMapSchema } from "../../src/lib/ranker/lookup-map"
import {
  artifactGate,
  loadIndexFromDisk,
  PATHS,
  readData,
  STAGED,
} from "../_helpers"

describe("searchNode", () => {
  it("returns the empty result for a blank query, touching nothing", async () => {
    const deps: SearchDeps = {
      index: loadVectorIndex({
        version: 2,
        model: "none",
        dims: 0,
        normalized: true,
        corpus_hash: "",
        records: [],
      }),
      rules: await loadRulesYaml(),
      lookup: new LookupIndex({ version: 1, entries: [] }),
      embedder: {
        embed: () =>
          Promise.reject(
            new Error("a blank query must not reach the embedder"),
          ),
      },
    }
    expect(await searchNode({ query: "   " }, deps)).toEqual({
      matches: [],
      total: 0,
    })
  })
})

const skipReason = artifactGate("node search", [STAGED.index, STAGED.model])

describe("searchNode over the staged index", () => {
  let deps: SearchDeps

  beforeAll(async () => {
    if (skipReason) return
    deps = {
      index: await loadIndexFromDisk(),
      rules: await loadRulesYaml(),
      lookup: new LookupIndex(
        LookupMapSchema.parse(await readData(PATHS.lookupMap)),
      ),
      embedder: await createNodeEmbedder(),
    }
  }, 180_000)

  it("promotes the lookup-map hit of a canonical form; total counts every record", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    const out = await searchNode({ query: " AUTO_CD ", limit: 10 }, deps)
    expect(out.matches).toHaveLength(10)
    expect(out.total).toBe(deps.index.records.length)
    expect(out.matches[0]?.rec).toMatchObject({
      category: "option",
      id: "autocd",
      display: "AUTO_CD",
    })
  }, 60_000)

  it("filters by category, default limit", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    const out = await searchNode(
      { query: "setopt builtin", category: "builtin" },
      deps,
    )
    expect(out.total).toBe(
      deps.index.records.filter(r => r.text.category === "builtin").length,
    )
    expect(out.matches).toHaveLength(10)
    expect(out.matches.every(m => m.rec.category === "builtin")).toBe(true)
    expect(out.matches[0]?.rec.id).toBe("setopt")
  }, 60_000)

  it("rejects an unknown category", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    await expect(
      searchNode({ query: "setopt", category: "nope" }, deps),
    ).rejects.toThrow(/unknown category/)
  })
})
