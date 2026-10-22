// Lookup-contract generation: drift against the committed JSON, and the
// bare-layer gate (every bare entry resolves via the lookup map). Pure on
// lexicon + resolver — fast, and always runs, so drift in the surface-form
// table or in resolver canonicalization shows without embedder or index.

import { loadLexicon } from "@carlwr/zsh-lexicon"
import { describe, expect, it } from "vitest"
import { lookupIndex } from "../../../nlp/core/lookup-map"
import { buildLookupContract, evalBare } from "../../../nlp/node/contract"
import { buildLookupMap } from "../../../nlp/node/lookup-map-build"
import { assertCommittedJson, PATHS } from "../../_helpers"

const lexicon = loadLexicon()

describe("lookup contract", () => {
  it("matches the committed file", async () => {
    await assertCommittedJson(
      PATHS.lookupContract,
      buildLookupContract(lexicon),
      "UPDATE_LOOKUP_CONTRACT",
    )
  })

  it("every bare entry resolves via the lookup map", () => {
    const idx = lookupIndex(buildLookupMap(lexicon))
    const e = evalBare(buildLookupContract(lexicon), idx)
    console.log(
      `[contract bare] ${e.bareTotal} entries, ${e.failures.length} failures (skipped ${e.skippedDecorated} decorated)`,
    )
    expect(e.failures, e.failures.join("\n")).toEqual([])
  })
})
