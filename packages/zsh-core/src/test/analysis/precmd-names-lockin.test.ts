import { expect, test } from "vitest"
import { precmdNames } from "../../analysis/precmd-names"
import { loadCorpus } from "../../docs/corpus"

// The scanner's precommand vocabulary is analysis-owned (it imports nothing
// from the docs domain) and meant to equal the manual's precommand-modifier
// section as the corpus parses it. A re-vendored manual that adds or drops a
// modifier fails here; adopt it in `analysis/precmd-names.ts` consciously.
test("analysis precmdNames == corpus precmd_modifier keys", () => {
  expect([...precmdNames].sort()).toEqual(
    [...loadCorpus().precmd_modifier.keys()].sort(),
  )
})
