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

describe("corpus string-field invariants", () => {
  test("every _id is printable ASCII with no whitespace", () => {
    const violations: string[] = []
    for (const cat of docCategories) {
      for (const rec of augmentWithMarkdown(corpus, cat)) {
        if (!ID_RE.test(rec._id)) {
          violations.push(`${cat}: _id ${JSON.stringify(rec._id)}`)
        }
      }
    }
    expect(violations, violations.join("\n  ")).toEqual([])
  })

  test("every _display and sig is printable ASCII (space allowed)", () => {
    const violations: string[] = []
    for (const cat of docCategories) {
      for (const rec of augmentWithMarkdown(corpus, cat)) {
        if (!SURFACE_RE.test(rec._display)) {
          violations.push(`${cat}: _display ${JSON.stringify(rec._display)}`)
        }
        const sig = (rec as { readonly sig?: unknown }).sig
        if (typeof sig === "string" && !SURFACE_RE.test(sig)) {
          violations.push(`${cat}: sig ${JSON.stringify(sig)}`)
        }
      }
    }
    expect(violations, violations.join("\n  ")).toEqual([])
  })

  test("every desc / mdBody / section is printable ASCII (space, \\n, \\t)", () => {
    const violations: string[] = []
    for (const cat of docCategories) {
      for (const rec of augmentWithMarkdown(corpus, cat)) {
        const r = rec as {
          readonly desc?: unknown
          readonly mdBody?: unknown
          readonly section?: unknown
        }
        // `desc` is optional on a handful of records (e.g. reserved words
        // whose head is documented by complex_command); skip when absent.
        if (typeof r.desc === "string" && r.desc && !isProse(r.desc)) {
          violations.push(`${cat}: desc ${JSON.stringify(r.desc.slice(0, 60))}`)
        }
        if (typeof r.mdBody === "string") {
          if (!r.mdBody) {
            violations.push(`${cat}: mdBody empty`)
          } else if (!isProse(r.mdBody)) {
            violations.push(
              `${cat}: mdBody ${JSON.stringify(r.mdBody.slice(0, 60))}`,
            )
          }
        }
        if (typeof r.section === "string" && r.section && !isProse(r.section)) {
          violations.push(`${cat}: section ${JSON.stringify(r.section)}`)
        }
      }
    }
    expect(violations, violations.join("\n  ")).toEqual([])
  })
})
