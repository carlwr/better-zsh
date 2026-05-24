/**
 * Shared Ajv setup for `outputSchema` validation. Memoizes a compiled
 * validator per `ToolDef` so property tests don't re-compile per case.
 */

import { cachedUnary } from "@carlwr/typescript-extra"
import Ajv2020 from "ajv/dist/2020.js"
import type { ToolDef } from "../../tool-defs.ts"

const ajv = new Ajv2020({ allErrors: true, strict: false })

export const validatorFor = cachedUnary((td: ToolDef) =>
  ajv.compile(td.outputSchema),
)

/** Throws with a tool-tagged message when validation fails. */
export function assertOutputValid(td: ToolDef, output: unknown): void {
  const validate = validatorFor(td)
  if (!validate(output)) {
    throw new Error(
      `outputSchema validation failed for ${td.name}: ${JSON.stringify(validate.errors)}`,
    )
  }
}
