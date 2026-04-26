/**
 * Builders for per-tool `outputSchema` JSON Schema documents.
 *
 * The match shape is per-category (`oneOf`-branched), so closed enums for
 * `subKind` are modeled per-category rather than as a single union. Each
 * branch is `additionalProperties: false`; the discriminator is
 * `category: { const: "<cat>" }`.
 *
 * `subKind` is always-or-never per category: when `subKindEnums[cat]` is
 * non-undefined the branch declares `subKind` with the closed enum AND
 * requires it; when undefined the branch omits the property and
 * `additionalProperties: false` forbids it. See DESIGN.md §"`subKind` is
 * always-or-never per category".
 *
 * Per AGENTS.md §"Never enumerate or count `DocCategory`", category names
 * and `subKind` enum values are interpolated from canonical zsh-core
 * tables (`docCategories`, `subKindEnums`) — never hand-typed.
 *
 * See DESIGN.md §"Output schemas (tooldef-owned)" for rationale.
 */

import { type DocCategory, docCategories, subKindEnums } from "@carlwr/zsh-core"
import type { ToolInputSchema } from "../tool-defs.ts"
import { MAX_LIMIT } from "./limits.ts"

/** Per-tool match-shape choices passed to `mkMatchSchema`. */
export interface MatchShape {
  readonly score?: "required" | "absent"
  readonly markdown?: "required" | "absent"
  /** When set, the `option` branch declares `negated: boolean` (required). */
  readonly negated?: "conditional-on-option"
}

/**
 * One `oneOf` branch for a single category. Closed shape
 * (`additionalProperties: false`) with `category` pinned via `const`;
 * `subKind` required-with-closed-enum when the category has a meaningful
 * sub-facet, forbidden otherwise.
 */
function mkMatchSchema(
  cat: DocCategory,
  shape: MatchShape,
): Readonly<Record<string, unknown>> {
  const subEnum = subKindEnums[cat]
  const properties: Record<string, unknown> = {
    category: { const: cat },
    id: { type: "string", minLength: 1 },
    display: { type: "string", minLength: 1 },
  }
  const required: string[] = ["category", "id", "display"]
  if (subEnum !== undefined) {
    properties.subKind = { enum: [...subEnum] }
    required.push("subKind")
  }
  if (shape.markdown === "required") {
    properties.markdown = { type: "string", minLength: 1 }
    required.push("markdown")
  }
  if (shape.score === "required") {
    properties.score = { type: "number", minimum: 0, maximum: 1 }
    required.push("score")
  }
  if (shape.negated === "conditional-on-option" && cat === "option") {
    properties.negated = { type: "boolean" }
    required.push("negated")
  }
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties,
  }
}

/** Envelope schema; `matches.items` is the per-category `oneOf` shape. */
export function mkOutputSchema(shape: MatchShape): ToolInputSchema {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["matches", "matchesReturned", "matchesTotal"],
    properties: {
      matches: {
        type: "array",
        items: { oneOf: docCategories.map(c => mkMatchSchema(c, shape)) },
      },
      matchesReturned: { type: "integer", minimum: 0, maximum: MAX_LIMIT },
      matchesTotal: { type: "integer", minimum: 0 },
    },
  }
}
