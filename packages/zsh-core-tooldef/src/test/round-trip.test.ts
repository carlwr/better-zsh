/**
 * Round-trip invariant for `zsh_docs`.
 *
 * For every literal corpus key `(cat, key)`, asserts that
 * `docs(corpus, { key, category: cat })` returns a single match
 * whose `id` is `key`. Locks in the "direct ∥ resolver, direct preferred"
 * spec at the value level — without direct precedence, template-key
 * categories (job_spec `%number` vs `%string`, history `!n` vs `!42`,
 * param_expn literal sigs) would not round-trip through their resolver
 * fallback.
 *
 * Synthesized-input property tests for resolver fallbacks are future work.
 */

import { loadCorpus } from "@carlwr/zsh-core"
import { type DocCategory, docCategories } from "@carlwr/zsh-core/taxonomy"
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
  test.each(allCases.map(c => [`${c.cat}:${c.key}`, c] as const))(
    "%s",
    (_label, { cat, key }) => {
      const r = docs(corpus, { key, category: cat })
      expect(r.matches.length).toBe(1)
      expect(r.matches[0]?.category).toBe(cat)
      expect(r.matches[0]?.id).toBe(key)
    },
  )
})

// Categories whose id is a shell-safe slug distinct from the human-readable
// `sig` (with whitespace / argument placeholders): the close-variant resolver
// must let the full-sig form round-trip to the slug id.
const sigCloseVariantCats = [
  "redirection",
  "param_expn_flag",
  "subscript_flag",
] as const

const sigCloseVariantCases: {
  cat: (typeof sigCloseVariantCats)[number]
  sig: string
  id: string
}[] = []
for (const cat of sigCloseVariantCats) {
  for (const [id, rec] of corpus[cat] as ReadonlyMap<
    string,
    { readonly sig: string }
  >) {
    if (rec.sig && rec.sig !== id) {
      sigCloseVariantCases.push({ cat, sig: rec.sig, id })
    }
  }
}

describe("docs close-variant: full-sig form resolves to the slug/bare-letter id", () => {
  test.each(
    sigCloseVariantCases.map(c => [`${c.cat}:${c.sig} -> ${c.id}`, c] as const),
  )("%s", (_label, { cat, sig, id }) => {
    const r = docs(corpus, { key: sig, category: cat })
    expect(r.matches.length).toBe(1)
    expect(r.matches[0]?.category).toBe(cat)
    expect(r.matches[0]?.id).toBe(id)
  })
})
