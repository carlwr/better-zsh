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
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js"
import fc from "fast-check"
import { describe, test } from "vitest"
import { type ToolDef, toolDefs } from "../tool-defs.ts"
import { assertEnvelopeInvariants } from "./_helpers/envelope-invariants.ts"
import { compact, inputArbFor } from "./_helpers/input-arbs.ts"

const corpus = loadCorpus()

const ajv = new Ajv2020({ allErrors: true, strict: false })
const validators = new Map<string, ValidateFunction>()
function validatorFor(td: ToolDef): ValidateFunction {
  let v = validators.get(td.name)
  if (!v) {
    v = ajv.compile(td.outputSchema)
    validators.set(td.name, v)
  }
  return v
}

describe("output-schema property test", () => {
  for (const td of toolDefs) {
    test(`${td.name}: execute output validates against outputSchema`, () => {
      const validate = validatorFor(td)
      fc.assert(
        fc.property(inputArbFor(td.name, corpus), raw => {
          const input = compact(raw)
          const output = td.execute(corpus, input)
          const ok = validate(output)
          if (!ok) {
            throw new Error(
              `outputSchema validation failed for ${td.name} input=${JSON.stringify(input)}: ${JSON.stringify(validate.errors)}`,
            )
          }
          assertEnvelopeInvariants(td.name, input, output)
        }),
        { numRuns: 200 },
      )
    })
  }
})
