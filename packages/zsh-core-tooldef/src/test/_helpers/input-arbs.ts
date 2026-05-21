/**
 * Shared fast-check arbitraries over each tool's `inputSchema`. Schemas
 * are small and stable; a generic Schema-to-arbitrary derivation isn't
 * worth the complexity.
 *
 * `key`/`query` are biased toward real corpus keys (exercise hit paths)
 * with a minority of random strings (miss / fuzzy paths). Optional fields
 * use `fc.record`'s `requiredKeys` so they are either absent or have a
 * concrete value — emitted records satisfy `additionalProperties: false`
 * without a post-strip step.
 */

import type { DocCorpus } from "@carlwr/zsh-core"
import { docCategories } from "@carlwr/zsh-core/taxonomy"
import fc from "fast-check"
import { entries } from "../../tools/shared/entries.ts"

const CORPUS_KEY_SAMPLE_CAP = 500

function corpusKeys(corpus: DocCorpus): readonly string[] {
  return entries(corpus)
    .map(e => e.id)
    .slice(0, CORPUS_KEY_SAMPLE_CAP)
}

/** Mix corpus keys (weight 6) with random strings (weight 4) — bias to hits. */
function stringInputArb(corpus: DocCorpus): fc.Arbitrary<string> {
  return fc.oneof(
    { arbitrary: fc.constantFrom(...corpusKeys(corpus)), weight: 6 },
    { arbitrary: fc.string(), weight: 4 },
  )
}

type InputArb = fc.Arbitrary<Record<string, unknown>>

export function inputArbFor(toolName: string, corpus: DocCorpus): InputArb {
  const category = fc.constantFrom(...docCategories)
  const limit = fc.integer({ min: 0, max: 100 })
  const key = stringInputArb(corpus)
  switch (toolName) {
    case "zsh_docs":
      return fc.record({ key, category }, { requiredKeys: ["key"] }) as InputArb
    case "zsh_search":
      return fc.record(
        { query: key, category, limit },
        { requiredKeys: ["query"] },
      ) as InputArb
    case "zsh_list":
      return fc.record({ category, limit }, { requiredKeys: [] }) as InputArb
    default:
      throw new Error(`unhandled tool ${toolName}`)
  }
}
