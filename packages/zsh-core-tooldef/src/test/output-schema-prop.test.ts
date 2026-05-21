/**
 * Drift guard: every `tool.execute(corpus, input)` must validate against
 * the tool's `outputSchema`. Inputs come from `inputArbFor` (shared with
 * `parity.test.ts`); piggybacks `assertEnvelopeInvariants` for the
 * non-schema-encodable parts.
 *
 * Fast-check seed is pinned globally in `setup-fast-check.ts` (see
 * `AGENTS.md` on reproducibility).
 */

import { loadCorpus } from "@carlwr/zsh-core"
import fc from "fast-check"
import { describe, test } from "vitest"
import { toolDefs } from "../tool-defs.ts"
import { assertOutputValid } from "./_helpers/ajv.ts"
import { assertEnvelopeInvariants } from "./_helpers/envelope-invariants.ts"
import { inputArbFor } from "./_helpers/input-arbs.ts"

const corpus = loadCorpus()

describe("output-schema property test", () => {
  for (const td of toolDefs) {
    test(`${td.name}: execute output validates against outputSchema`, () => {
      fc.assert(
        fc.property(inputArbFor(td.name, corpus), input => {
          const output = td.execute(corpus, input)
          assertOutputValid(td, output)
          assertEnvelopeInvariants(td.name, input, output)
        }),
        { numRuns: 200 },
      )
    })
  }
})
