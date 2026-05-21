/**
 * Shared Ajv setup for `outputSchema` validation. Memoizes a compiled
 * validator per `ToolDef.name` so property tests don't re-compile per case.
 */

import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js"
import type { ToolDef } from "../../tool-defs.ts"

const ajv = new Ajv2020({ allErrors: true, strict: false })
const cache = new Map<string, ValidateFunction>()

export function validatorFor(td: ToolDef): ValidateFunction {
  let v = cache.get(td.name)
  if (!v) {
    v = ajv.compile(td.outputSchema)
    cache.set(td.name, v)
  }
  return v
}

/** Throws with a tool-tagged message when validation fails. */
export function assertOutputValid(td: ToolDef, output: unknown): void {
  const validate = validatorFor(td)
  if (!validate(output)) {
    throw new Error(
      `outputSchema validation failed for ${td.name}: ${JSON.stringify(validate.errors)}`,
    )
  }
}
