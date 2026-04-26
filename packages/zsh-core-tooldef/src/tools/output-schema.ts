/**
 * Builders for per-tool `outputSchema` JSON Schema documents.
 *
 * The match shape is per-category (`oneOf`-branched), so closed enums for
 * `subKind` are modeled per-category rather than as a single union. Each
 * branch is `additionalProperties: false`; the discriminator is
 * `category: { const: "<cat>" }`.
 *
 * Per AGENTS.md §"Never enumerate or count `DocCategory`", category names
 * and `subKind` enum values are interpolated from canonical zsh-core
 * tables (`docCategories`, `subKindEnums`) — never hand-typed.
 *
 * See DESIGN.md §"Output schemas (tooldef-owned)" for rationale.
 */

import { type DocCategory, docCategories, subKindEnums } from "@carlwr/zsh-core"
import type { ToolInputSchema } from "../tool-defs.ts"

/** Per-tool match-shape choices passed to `mkMatchSchema`. */
export interface MatchShape {
  readonly score?: "required" | "absent"
  readonly markdown?: "required" | "absent"
  /** When set, the `option` branch declares `negated: boolean` (required). */
  readonly negated?: "conditional-on-option"
  /**
   * `subKind` declaration:
   *
   * - `"absent"` (default): branches do not declare `subKind`; with
   *   `additionalProperties: false` this forbids it (use for tools whose
   *   match shape doesn't carry the field, e.g. `zsh_docs`).
   * - `"optional"`: when `subKindEnums[cat]` is non-undefined, declare
   *   `subKind` with the closed enum but never require it (records may
   *   still omit it, e.g. `reserved_word` without `pos`).
   *
   * Categories with `subKindEnums[cat] === undefined` omit the property
   * regardless — nothing to enumerate.
   */
  readonly subKind?: "absent" | "optional"
}

/**
 * One `oneOf` branch for a single category. Closed shape
 * (`additionalProperties: false`) with `category` pinned via `const`;
 * `subKind` handling per `MatchShape.subKind`.
 */
function mkMatchSchema(
  cat: DocCategory,
  shape: MatchShape,
): Readonly<Record<string, unknown>> {
  const subEnum = subKindEnums[cat]
  const properties: Record<string, unknown> = {
    category: { const: cat },
    id: { type: "string" },
    display: { type: "string" },
  }
  const required: string[] = ["category", "id", "display"]
  if (shape.subKind === "optional" && subEnum !== undefined) {
    properties.subKind = { enum: [...subEnum] }
  }
  if (shape.markdown === "required") {
    properties.markdown = { type: "string" }
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
      matchesReturned: { type: "integer", minimum: 0 },
      matchesTotal: { type: "integer", minimum: 0 },
    },
  }
}
