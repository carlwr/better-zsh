/**
 * Builders for per-tool `outputSchema` JSON Schema documents.
 *
 * Per-category match branches sit in `oneOf` under `matches.items`, with the
 * common shape factored into `$defs`/`$ref`:
 *
 * - `$defs.IdString` — `{ type: "string", minLength: 1 }` referenced by `id`,
 *   `display`, `mdBody`.
 * - `$defs.SubKind.<cat>` — closed enum of subKind values per category that
 *   has a meaningful sub-facet; referenced from the per-category match branch.
 * - `$defs.Feedback` — closed `oneOf` over `ResolverFeedback` kinds; referenced
 *   from per-category match branches when the tool surfaces feedback (today,
 *   only `zsh_docs`). Adding a feedback kind in zsh-core lifts here for free.
 *
 * `subKind` is always-or-never per category: when `subKindEnums[cat]` is
 * non-undefined the branch declares `subKind` with the closed enum AND
 * requires it; when undefined the branch omits the property and
 * `additionalProperties: false` forbids it. See `DESIGN.md` (subKind
 * always-or-never rule).
 *
 * Per `AGENTS.md`, category names, subKind values, and feedback kinds are
 * interpolated from zsh-core tables — never hand-typed literals.
 *
 * Rationale for owning schemas here: `DESIGN.md` (output schemas).
 */

import { resolverFeedbackKinds } from "@carlwr/zsh-core/resolver"
import {
  type DocCategory,
  docCategories,
  subKindEnums,
} from "@carlwr/zsh-core/taxonomy"
import type { ToolInputSchema } from "../tool-defs.ts"
import { MAX_LIMIT } from "./limits.ts"

/** Per-tool match-shape choices passed to `mkMatchSchema`. */
export interface MatchShape {
  readonly score?: "required" | "absent"
  readonly mdBody?: "required" | "absent"
  /**
   * `"optional"`: each category branch may declare optional `feedback`
   * (`#/$defs/Feedback`). `"absent"`: branches omit `feedback`.
   */
  readonly feedback?: "optional" | "absent"
}

const idStringRef = { $ref: "#/$defs/IdString" } as const
const feedbackRef = { $ref: "#/$defs/Feedback" } as const

const subKindRef = (cat: DocCategory): { readonly $ref: string } => ({
  $ref: `#/$defs/SubKind.${cat}`,
})

/**
 * One `oneOf` branch for a single category. Closed shape
 * (`additionalProperties: false`) with `category` pinned via `const`;
 * `subKind` required-with-closed-enum when the category has a meaningful
 * sub-facet, forbidden otherwise; `feedback` parametric across categories
 * (uniform optional slot when the tool surfaces feedback).
 */
function mkMatchSchema(
  cat: DocCategory,
  shape: MatchShape,
): Readonly<Record<string, unknown>> {
  const subEnum = subKindEnums[cat]
  const properties: Record<string, unknown> = {
    category: { const: cat },
    id: idStringRef,
    display: idStringRef,
  }
  const required: string[] = ["category", "id", "display"]
  if (subEnum !== undefined) {
    properties.subKind = subKindRef(cat)
    required.push("subKind")
  }
  if (shape.mdBody === "required") {
    properties.mdBody = idStringRef
    required.push("mdBody")
  }
  if (shape.score === "required") {
    properties.score = { type: "number", minimum: 0, maximum: 1 }
    required.push("score")
  }
  if (shape.feedback === "optional") {
    properties.feedback = feedbackRef
  }
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties,
  }
}

/** `$defs` block: shared fragments referenced from per-category match branches. */
function mkDefs(shape: MatchShape): Readonly<Record<string, unknown>> {
  const defs: Record<string, unknown> = {
    IdString: { type: "string", minLength: 1 },
  }
  for (const cat of docCategories) {
    const subEnum = subKindEnums[cat]
    if (subEnum !== undefined) {
      defs[`SubKind.${cat}`] = { enum: [...subEnum] }
    }
  }
  if (shape.feedback === "optional") {
    defs.Feedback = {
      oneOf: resolverFeedbackKinds.map(kind => ({
        type: "object",
        additionalProperties: false,
        required: ["kind"],
        properties: { kind: { const: kind } },
      })),
    }
  }
  return defs
}

/** Envelope schema; `matches.items` is the per-category `oneOf` shape. */
export function mkOutputSchema(shape: MatchShape): ToolInputSchema {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["matches", "matchesReturned", "matchesTotal"],
    $defs: mkDefs(shape),
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
