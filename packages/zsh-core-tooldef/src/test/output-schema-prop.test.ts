/**
 * Drift guard: every `tool.execute(corpus, input)` must validate against
 * the tool's `outputSchema`. Inputs are hand-rolled fast-check arbitraries
 * over each tool's `inputSchema` — schemas are small, a generic
 * Schema-to-arbitrary derivation isn't worth the complexity.
 *
 * `raw`/`query` are biased toward real corpus keys (exercise hit paths)
 * with a minority of random strings (miss / fuzzy paths).
 *
 * Fast-check seed is pinned globally in `setup-fast-check.ts` (see
 * `AGENTS.md` on reproducibility).
 */

import { loadCorpus } from "@carlwr/zsh-core"
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js"
import fc from "fast-check"
import { describe, test } from "vitest"
import { type ToolDef, toolDefs } from "../tool-defs.ts"
import { entries } from "../tools/entries.ts"

const corpus = loadCorpus()

/** Corpus keys (capped at 500), used to bias `raw`/`query` toward hits. */
const corpusKeys: readonly string[] = (() => {
  const all = entries(corpus).map(e => e.id)
  return all.slice(0, 500)
})()

const VALID_CATEGORIES: readonly string[] = [
  ...new Set(entries(corpus).map(e => e.category)),
]

/** Mix corpus keys with random strings (6:4 weight, biased to hits). */
const stringInputArb = fc.oneof(
  { arbitrary: fc.constantFrom(...corpusKeys), weight: 6 },
  { arbitrary: fc.string(), weight: 4 },
)

/**
 * Per-tool input arbitrary. Required fields always emitted; optional fields
 * wrapped in `fc.option(..., { nil: undefined })` and stripped before the
 * call so `additionalProperties: false` is respected.
 */
function inputArbFor(toolName: string): fc.Arbitrary<Record<string, unknown>> {
  const categoryArb = fc.constantFrom(...VALID_CATEGORIES)
  const limitArb = fc.integer({ min: 0, max: 100 })
  switch (toolName) {
    case "zsh_docs":
      return fc.record(
        {
          raw: stringInputArb,
          category: fc.option(categoryArb, { nil: undefined }),
        },
        { requiredKeys: ["raw"] },
      ) as fc.Arbitrary<Record<string, unknown>>
    case "zsh_search":
      return fc.record(
        {
          query: stringInputArb,
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

/** Strip `undefined` values so records match `additionalProperties:false`. */
function compact(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) out[k] = v
  }
  return out
}

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

/**
 * Envelope invariants the JSON Schema does not encode (numeric equality,
 * uniqueness, category-filter purity). Cheap to assert here per-run, so
 * fast-check shrinks against the same input that breaks them.
 */
function assertEnvelopeInvariants(
  toolName: string,
  input: Record<string, unknown>,
  output: unknown,
): void {
  const env = output as {
    matches: ReadonlyArray<Record<string, unknown>>
    matchesReturned: number
    matchesTotal: number
  }
  if (env.matchesReturned !== env.matches.length) {
    throw new Error(
      `${toolName}: matchesReturned=${env.matchesReturned} != matches.length=${env.matches.length} for input=${JSON.stringify(input)}`,
    )
  }
  if (env.matchesTotal < env.matchesReturned) {
    throw new Error(
      `${toolName}: matchesTotal=${env.matchesTotal} < matchesReturned=${env.matchesReturned} for input=${JSON.stringify(input)}`,
    )
  }
  // Dedup invariant: no two matches share `(category, id)`. Enforced in
  // `zsh_search`'s tier walk; asserted for every tool here.
  const keys = env.matches.map(m => `${String(m.category)}\0${String(m.id)}`)
  if (new Set(keys).size !== keys.length) {
    throw new Error(
      `${toolName}: duplicate (category, id) in matches for input=${JSON.stringify(input)}`,
    )
  }
  // Category-filter purity: if `input.category` is set, every match must
  // carry that category. Catches filter-leakage regressions.
  if (typeof input.category === "string") {
    for (const m of env.matches) {
      if (m.category !== input.category) {
        throw new Error(
          `${toolName}: match category=${String(m.category)} leaks past filter=${input.category} for input=${JSON.stringify(input)}`,
        )
      }
    }
  }
}

describe("output-schema property test", () => {
  for (const td of toolDefs) {
    test(`${td.name}: execute output validates against outputSchema`, () => {
      const validate = validatorFor(td)
      fc.assert(
        fc.property(inputArbFor(td.name), raw => {
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
