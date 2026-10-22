// Build side of the lookup map. Pure on lexicon + resolver — no staged
// assets, always runs.

import { loadLexicon } from "@carlwr/zsh-core"
import { describe, expect, it } from "vitest"
import { lookupIndex } from "../../../nlp/core/lookup-map"
import { buildLookupMap } from "../../../nlp/node/lookup-map-build"
import { assertCommittedJson, PATHS } from "../../_helpers"

const lexicon = loadLexicon()

describe("lookup map", () => {
  it("matches the committed file", async () => {
    await assertCommittedJson(
      PATHS.lookupMap,
      buildLookupMap(lexicon),
      "UPDATE_LOOKUP_MAP",
    )
  })

  const idx = lookupIndex(buildLookupMap(lexicon))

  it.each([
    ["AUTO_CD", "option", "autocd"],
    ["auto_cd", "option", "autocd"],
    ["autocd", "option", "autocd"],
    ["NO_AUTO_CD", "option", "autocd"],
    ["no_autocd", "option", "autocd"],
    ["setopt", "builtin", "setopt"],
    // Not an enumerated builtin form (the canonical one is the lowercase
    // id): reached via the lowercase fallback.
    ["SETOPT", "builtin", "setopt"],
    ["fc", "builtin", "fc"],
    ["chdir", "builtin", "chdir"],
    ["_arguments", "comp_utility", "_arguments"],
  ])("%j resolves to %s/%s", (raw, category, id) => {
    expect(idx.lookup(raw)).toEqual({ category, id })
  })
})
