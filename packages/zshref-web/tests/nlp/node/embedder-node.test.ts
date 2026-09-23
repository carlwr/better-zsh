// Node embedder over the local model; skipped without it
// (`scripts/fetch-model`). The fetch script's model-id pin always runs.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { isSingle } from "@carlwr/typescript-extra"
import { beforeAll, describe, expect, it } from "vitest"

import { DIMS, MODEL_ID } from "../../../nlp/core/types"
import { dot } from "../../../nlp/core/vec"
import {
  createNodeEmbedder,
  type Embedder,
  embedQuery,
  embedUnique,
} from "../../../nlp/node/embedder-node"
import { loadRulesYaml } from "../../../nlp/node/rules-load"
import { artifactGate, PATHS, STAGED } from "../../_helpers"

// A few f32 ulps: the norm of a normalized 384-vector re-summed in f64.
const UNIT_TOL = 1e-6

function expectUnit(v: Float32Array): void {
  expect(v.length).toBe(DIMS)
  expect(Math.abs(Math.sqrt(dot(v, v)) - 1)).toBeLessThanOrEqual(UNIT_TOL)
}

/** The fetch script names the model too (a shell script cannot import it); `MODEL_ID` is the definition. */
it("fetch-model pins MODEL_ID", () => {
  const script = readFileSync(
    resolve(PATHS.pkgDir, "scripts/fetch-model"),
    "utf8",
  )
  expect(/^repo=(\S+)/m.exec(script)?.[1]).toBe(MODEL_ID)
})

const skipReason = artifactGate("node embedder", [...STAGED.model])

describe("node embedder", () => {
  let e: Embedder
  const one = async (text: string): Promise<Float32Array> => {
    const vs = await e.embed([text])
    if (!isSingle(vs)) throw new Error(`${vs.length} vectors`)
    return vs[0]
  }

  beforeAll(async () => {
    if (skipReason) return
    e = await createNodeEmbedder()
  }, 120_000)

  const overLong = `passage: ${"the history file ".repeat(200)}`
  const texts = [
    "passage: cd to a directory by typing its name",
    "passage: setopt",
    overLong,
  ]

  it("returns DIMS-long unit vectors", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    expectUnit(await one("query: change directory"))
  }, 60_000)

  it("is deterministic", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    expect(await one("query: glob qualifiers")).toEqual(
      await one("query: glob qualifiers"),
    )
  }, 60_000)

  it("truncates an input over the token limit", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    expect(overLong.split(" ").length).toBeGreaterThan(512)
    expectUnit(await one(overLong))
  }, 60_000)

  // One model call per text: a vector never depends on its neighbours.
  it("embeds a list exactly as it embeds each text alone", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    const listed = await e.embed(texts)
    expect(listed).toHaveLength(texts.length)
    for (const [i, text] of texts.entries()) {
      expect(listed[i], `text ${i}`).toEqual(await one(text))
    }
  }, 60_000)

  it("embedUnique dedups in first-occurrence order and agrees with embedQuery", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    const rules = await loadRulesYaml()
    const map = await embedUnique(
      e,
      ["change directory", "glob qualifiers", "change directory"],
      rules,
    )
    expect([...map.keys()]).toEqual(["change directory", "glob qualifiers"])
    const single = await embedQuery(e, "glob qualifiers", rules)
    expectUnit(single)
    expect(map.get("glob qualifiers")).toEqual(single)
  }, 60_000)
})
