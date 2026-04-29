/**
 * Drift guard: every record's projected `_id`/`_display` must be ASCII.
 *
 * The Rust CLI's fuzzy scorer (`zshref-rs/src/fuzzy.rs`) is ASCII-only;
 * non-ASCII identifiers would silently fall through to "no fuzzy match"
 * for those records. The Rust side mirrors this check at corpus-load
 * time; this test makes the same regression visible without a build.
 */

import { describe, expect, test } from "vitest"
import { loadCorpus } from "../docs/corpus.ts"
import { docCategories, docDisplay, docId } from "../docs/taxonomy.ts"

describe("corpus identity fields are ASCII", () => {
  test("every record's _id and _display project to ASCII strings", () => {
    const corpus = loadCorpus()
    const violations: string[] = []
    for (const cat of docCategories) {
      const map = corpus[cat]
      for (const [, rec] of map) {
        const id = docId[cat](rec as never) as string
        const display = docDisplay(cat, rec as never)
        if (!isAscii(id)) {
          violations.push(`${cat}: _id ${JSON.stringify(id)}`)
        }
        if (!isAscii(display)) {
          violations.push(`${cat}: _display ${JSON.stringify(display)}`)
        }
      }
    }
    expect(violations, violations.join("\n  ")).toEqual([])
  })
})

function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0x7f) return false
  }
  return true
}
