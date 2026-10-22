import { loadLexicon } from "@carlwr/zsh-lexicon"
import { expect, test } from "vitest"
import { precmdNames } from "../../analysis/precmd-names"

// The scanner's precommand vocabulary is analysis-owned (it imports nothing
// from the docs domain) and meant to equal the manual's precommand-modifier
// section as zsh-lexicon parses it. A re-vendored manual that adds or drops a
// modifier fails here; adopt it in `analysis/precmd-names.ts` consciously.
test("analysis precmdNames == lexicon precmd_modifier keys", () => {
  expect([...precmdNames].sort()).toEqual(
    [...loadLexicon().precmd_modifier.keys()].sort(),
  )
})
