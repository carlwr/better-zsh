/**
 * Global, category-agnostic string-field invariants for the corpus.
 *
 * Three tiers from tightest to loosest:
 * - `_id` (lookup key): printable ASCII, no whitespace, non-empty.
 * - `_display` / `sig` (surface form): printable ASCII + space.
 * - `desc` / `mdBody` / `section` (prose): no control characters except
 *   `\n` and `\t`; Unicode allowed (upstream prose carries em-dashes etc.).
 *
 * Rationale: id strings must be shell-safe and URL/CLI-friendly. The Rust
 * fuzzy scorer (`zshref-rs/src/fuzzy.rs`) is ASCII-only; non-ASCII
 * identifiers would silently fall through to "no fuzzy match" for the
 * affected records.
 */

import { describe, expect, test } from "vitest"
import { mkDocumented } from "../docs/brands.ts"
import { loadCorpus } from "../docs/corpus.ts"
import { augmentWithMarkdown } from "../docs/json-projection.ts"
import { docCategories } from "../docs/taxonomy.ts"

const corpus = loadCorpus()

const ID_RE = /^[\x21-\x7E]+$/
const SURFACE_RE = /^[\x20-\x7E]+$/

// Allows `\t` (0x09) and `\n` (0x0A); rejects all other control chars and DEL.
// Function form because lint forbids control-char escapes in regex literals.
function isProse(s: string): boolean {
  if (!s) return false
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 0x09 || c === 0x0a) continue
    if (c < 0x20 || c === 0x7f) return false
  }
  return true
}

// Augment once: `augmentWithMarkdown` re-renders every body.
const augmented = docCategories.map(
  cat => [cat, augmentWithMarkdown(corpus, cat)] as const,
)

const strField = (rec: object, key: string): string | undefined => {
  const v = (rec as Record<string, unknown>)[key]
  return typeof v === "string" ? v : undefined
}

describe("corpus string-field invariants", () => {
  test("every _id is printable ASCII with no whitespace", () => {
    const violations: string[] = []
    for (const [cat, recs] of augmented)
      for (const rec of recs)
        if (!ID_RE.test(rec._id))
          violations.push(`${cat}: _id ${JSON.stringify(rec._id)}`)
    expect(violations, violations.join("\n  ")).toEqual([])
  })

  test("every _display and sig is printable ASCII (space allowed)", () => {
    const violations: string[] = []
    for (const [cat, recs] of augmented)
      for (const rec of recs) {
        if (!SURFACE_RE.test(rec._display))
          violations.push(`${cat}: _display ${JSON.stringify(rec._display)}`)
        const sig = strField(rec, "sig")
        if (sig !== undefined && !SURFACE_RE.test(sig))
          violations.push(`${cat}: sig ${JSON.stringify(sig)}`)
      }
    expect(violations, violations.join("\n  ")).toEqual([])
  })

  // Catches an extractor minting a record from a non-canonical raw form
  // (e.g. lowercase "auto_cd" instead of "autocd"): every corpus id must
  // already be its own brand-normalized form. `docId`-keyed corpus maps make
  // `corpus[cat].keys()` the canonical id list.
  test("every corpus id is idempotent under mkDocumented", () => {
    const violations: string[] = []
    for (const cat of docCategories)
      for (const id of corpus[cat].keys()) {
        const s = id as string
        if ((mkDocumented(cat, s) as string) !== s)
          violations.push(`${cat}: ${s}`)
      }
    expect(violations).toEqual([])
  })

  test("every desc / mdBody / section is printable ASCII (space, \\n, \\t)", () => {
    const violations: string[] = []
    // `desc`/`section` are optional on some records (e.g. reserved words
    // whose head is documented by complex_command); skip when absent.
    const checkProse = (cat: string, key: string, val: string | undefined) => {
      if (val !== undefined && val && !isProse(val))
        violations.push(`${cat}: ${key} ${JSON.stringify(val.slice(0, 60))}`)
    }
    for (const [cat, recs] of augmented)
      for (const rec of recs) {
        checkProse(cat, "desc", strField(rec, "desc"))
        checkProse(cat, "section", strField(rec, "section"))
        const md = strField(rec, "mdBody")
        if (md === undefined) continue
        if (!md) violations.push(`${cat}: mdBody empty`)
        else checkProse(cat, "mdBody", md)
      }
    expect(violations, violations.join("\n  ")).toEqual([])
  })
})
