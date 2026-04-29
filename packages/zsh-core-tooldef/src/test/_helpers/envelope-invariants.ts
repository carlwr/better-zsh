/**
 * Envelope invariants the JSON Schema does not encode (numeric equality,
 * uniqueness, category-filter purity). Cheap to assert per-run, so
 * fast-check shrinks against the same input that breaks them.
 */

export function assertEnvelopeInvariants(
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
