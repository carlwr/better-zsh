// The fixture generators against their committed files. The parity side is
// self-contained (generated vectors, corpus in-process); the sanity build
// needs the staged index and the model, and skips without them.

import { loadCorpus } from "@carlwr/zsh-core"
import { describe, expect, it } from "vitest"

import { createNodeEmbedder } from "../../../nlp/node/embedder-node"
import {
  buildParityFixture,
  buildSanityFixture,
  loadSanityFixture,
  renderSanity,
  sanityFailures,
} from "../../../nlp/node/fixtures"
import { fixtureJson } from "../../../nlp/node/json-f32"
import { loadRulesYaml } from "../../../nlp/node/rules-load"
import {
  artifactGate,
  assertCommittedJson,
  loadIndexFromDisk,
  PATHS,
  STAGED,
  withinDecimals,
} from "../../_helpers"

const corpus = loadCorpus()

describe("parity fixture", () => {
  it("matches the committed file", async () => {
    const fixture = buildParityFixture(corpus, await loadRulesYaml())
    await assertCommittedJson(
      PATHS.parityFixture,
      fixture,
      "UPDATE_PARITY_FIXTURE",
      { render: fixtureJson },
    )
  })
})

/** Decimals a rebuilt sanity score must agree to: the embedder runtime differs across platforms by ~1e-7. */
const SANITY_DECIMALS = 5

describe("sanity fixture", () => {
  const skipReason = artifactGate("sanity fixture build", [
    ...STAGED.index,
    ...STAGED.model,
  ])

  // Identities and structure exact, scores within `SANITY_DECIMALS`.
  it("reproduces the committed file within the tolerance", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    const [index, rules, embedder] = await Promise.all([
      loadIndexFromDisk(),
      loadRulesYaml(),
      createNodeEmbedder(),
    ])
    const fresh = await buildSanityFixture({ index, rules, embedder })
    await assertCommittedJson(
      PATHS.sanityFixture,
      fresh,
      "UPDATE_SANITY_FIXTURE",
      {
        render: fixtureJson,
        expected: v => withinDecimals(v, SANITY_DECIMALS),
      },
    )
  }, 180_000)

  // Over the committed file, so it always runs: identity as curated, top
  // above the floor, margin over the runner-up. Failure → re-curate the
  // query list; do not relax the invariants.
  it("the committed fixture holds the invariants", async () => {
    const fixture = await loadSanityFixture()
    console.log(renderSanity(fixture).trimEnd())
    expect(sanityFailures(fixture)).toEqual([])
  })
})
