/**
 * Round-trip invariant for `zsh_docs`.
 *
 * For every literal corpus key `(cat, key)`, asserts that
 * `docs(corpus, { raw: key, category: cat })` returns a single match
 * whose `id` is `key`. Locks in the "direct ∥ resolver, direct preferred"
 * spec at the value level — without direct precedence, template-key
 * categories (job_spec `%number` vs `%string`, history `!n` vs `!42`,
 * param_expn literal sigs) would not round-trip through their resolver
 * fallback.
 *
 * Property-test coverage of resolver fallbacks (synthesized non-key inputs)
 * is deferred (see plan §"Deferred follow-ups").
 */

import { type DocCategory, docCategories, loadCorpus } from "@carlwr/zsh-core"
import { describe, expect, test } from "vitest"
import { docs } from "../../index.ts"

const corpus = loadCorpus()

const allCases: { cat: DocCategory; key: string }[] = []
for (const cat of docCategories) {
  for (const key of corpus[cat].keys()) {
    allCases.push({ cat, key: key as string })
  }
}

describe("docs round-trip: every literal corpus key resolves to itself", () => {
  test.each(
    allCases.map(c => [`${c.cat}:${c.key}`, c] as const),
  )("%s", (_label, { cat, key }) => {
    const r = docs(corpus, { raw: key, category: cat })
    expect(r.matches.length).toBe(1)
    expect(r.matches[0]?.category).toBe(cat)
    expect(r.matches[0]?.id).toBe(key)
  })
})
