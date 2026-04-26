import { describe, expect, test } from "vitest"
import { cmdHeadFactsOnLine } from "../../analysis/line-facts"
import { loadCorpus } from "../../docs/corpus"

const corpus = loadCorpus()

// Lock-in test for the analysis layer's "command-position keywords" set.
// `cmdHeadFactsOnLine` emits a `reserved-word` fact for a token in command
// position iff the token is in this set. The set is intentionally distinct
// from `corpus.reserved_word` (the zsh manual's reserved-word list); see
// DESIGN.md §"Reserved word: an enumeration-primary doc category" and the
// comment block above the constant in `analysis/line-facts.ts`.
//
// This test pins the current behaviour so refactors can't drift it
// silently. If the analyzer's keyword set is intentionally changed, update
// the EXPECTED set below to match — and add prose justifying the new
// element in the line-facts.ts comment.
describe("analysis layer: command-position keyword set lock-in", () => {
  function emitsReservedFact(word: string): boolean {
    const facts = cmdHeadFactsOnLine(word)
    return facts.some(f => f.kind === "reserved-word" && f.text === word)
  }

  // Words the analyzer currently treats as command-position keywords. Exact
  // membership; any drift breaks this test.
  const EXPECTED: ReadonlySet<string> = new Set([
    "if",
    "then",
    "else",
    "elif",
    "fi",
    "for",
    "in",
    "while",
    "until",
    "do",
    "done",
    "case",
    "esac",
    "select",
    "coproc",
    "function",
    "!",
    "{",
    "}",
    "[[",
    "]]",
    "time",
  ])

  test("each EXPECTED keyword emits a reserved-word fact in command position", () => {
    const missing = [...EXPECTED].filter(w => !emitsReservedFact(w))
    expect(missing).toEqual([])
  })

  test("no corpus reserved_word outside EXPECTED emits a reserved-word fact", () => {
    const corpusOnly = [...corpus.reserved_word.keys()].filter(
      w => !EXPECTED.has(w),
    )
    const leaked = corpusOnly.filter(emitsReservedFact)
    expect(leaked).toEqual([])
  })

  test("EXPECTED size is stable", () => {
    expect(EXPECTED.size).toBe(22)
  })
})
