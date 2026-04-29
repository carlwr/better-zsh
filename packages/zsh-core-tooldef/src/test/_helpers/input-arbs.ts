/**
 * Shared fast-check arbitraries over each tool's `inputSchema`. Schemas
 * are small and stable; a generic Schema-to-arbitrary derivation isn't
 * worth the complexity.
 *
 * `raw`/`query` are biased toward real corpus keys (exercise hit paths)
 * with a minority of random strings (miss / fuzzy paths). Optional fields
 * are wrapped in `fc.option(..., { nil: undefined })`; pair the output
 * with `compact()` before passing to `execute(corpus, input)` so
 * `additionalProperties: false` is respected.
 */

import type { DocCorpus } from "@carlwr/zsh-core"
import fc from "fast-check"
import { entries } from "../../tools/entries.ts"

export function corpusKeys(corpus: DocCorpus): readonly string[] {
  return entries(corpus)
    .map(e => e.id)
    .slice(0, 500)
}

export function validCategories(corpus: DocCorpus): readonly string[] {
  return [...new Set(entries(corpus).map(e => e.category))]
}

/** Mix corpus keys (weight 6) with random strings (weight 4) — bias to hits. */
export function stringInputArb(corpus: DocCorpus): fc.Arbitrary<string> {
  return fc.oneof(
    { arbitrary: fc.constantFrom(...corpusKeys(corpus)), weight: 6 },
    { arbitrary: fc.string(), weight: 4 },
  )
}

export function inputArbFor(
  toolName: string,
  corpus: DocCorpus,
): fc.Arbitrary<Record<string, unknown>> {
  const categoryArb = fc.constantFrom(...validCategories(corpus))
  const limitArb = fc.integer({ min: 0, max: 100 })
  const stringArb = stringInputArb(corpus)
  switch (toolName) {
    case "zsh_docs":
      return fc.record(
        {
          raw: stringArb,
          category: fc.option(categoryArb, { nil: undefined }),
        },
        { requiredKeys: ["raw"] },
      ) as fc.Arbitrary<Record<string, unknown>>
    case "zsh_search":
      return fc.record(
        {
          query: stringArb,
          category: fc.option(categoryArb, { nil: undefined }),
          limit: fc.option(limitArb, { nil: undefined }),
        },
        { requiredKeys: ["query"] },
      ) as fc.Arbitrary<Record<string, unknown>>
    case "zsh_list":
      return fc.record(
        {
          category: fc.option(categoryArb, { nil: undefined }),
          limit: fc.option(limitArb, { nil: undefined }),
        },
        { requiredKeys: [] },
      ) as fc.Arbitrary<Record<string, unknown>>
    default:
      throw new Error(`unhandled tool ${toolName}`)
  }
}

/** Strip `undefined` values so records match `additionalProperties: false`. */
export function compact(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) out[k] = v
  }
  return out
}
