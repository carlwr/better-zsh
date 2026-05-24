/**
 * Envelope invariants the JSON Schema does not encode (numeric equality,
 * uniqueness, category-filter purity). Cheap to assert per-run, so
 * fast-check shrinks against the same input that breaks them.
 *
 * Called after Ajv validation succeeds, so `category` / `id` are known to be
 * strings on every match.
 */

import { allUnique } from "@carlwr/typescript-extra"
import type { Envelope } from "../../tools/shared/envelope.ts"

interface Match {
  readonly category: string
  readonly id: string
}

export function assertEnvelopeInvariants(
  toolName: string,
  input: Record<string, unknown>,
  output: unknown,
): void {
  const env = output as Envelope<Match>
  const fail = (msg: string) => {
    throw new Error(`${toolName}: ${msg} for input=${JSON.stringify(input)}`)
  }
  if (env.matchesReturned !== env.matches.length) {
    fail(
      `matchesReturned=${env.matchesReturned} != matches.length=${env.matches.length}`,
    )
  }
  if (env.matchesTotal < env.matchesReturned) {
    fail(
      `matchesTotal=${env.matchesTotal} < matchesReturned=${env.matchesReturned}`,
    )
  }
  // Dedup invariant: no two matches share `(category, id)`. Enforced in
  // `zsh_search`'s tier walk; asserted for every tool here.
  const keys = env.matches.map(m => `${m.category}\0${m.id}`)
  if (!allUnique(keys)) fail("duplicate (category, id) in matches")
  // Category-filter purity: with `input.category` set, every match must
  // carry that category. Catches filter-leakage regressions.
  if (typeof input.category === "string") {
    for (const m of env.matches) {
      if (m.category !== input.category) {
        fail(`match category=${m.category} leaks past filter=${input.category}`)
      }
    }
  }
}
