import { loadCorpus } from "@carlwr/zsh-core"
import { expect, test, describe as vdesc } from "vitest"
import { describe } from "../../../index.ts"

const corpus = loadCorpus()

vdesc("describe", () => {
  test.each([
    { category: "builtin", id: "echo" },
    { category: "option", id: "autocd" },
    { category: "reserved_word", id: "if" },
  ] as const)("$category:$id → match", ({ category, id }) => {
    const r = describe(corpus, { category, id })
    expect(r.match?.category).toBe(category)
    expect(r.match?.id).toBe(id)
    expect(r.match?.display.length).toBeGreaterThan(0)
    expect(r.match?.markdown.length).toBeGreaterThan(0)
  })

  test("option display preserves human case (AUTO_CD)", () => {
    expect(
      describe(corpus, { category: "option", id: "autocd" }).match?.display,
    ).toBe("AUTO_CD")
  })

  test("unknown id returns null", () => {
    expect(
      describe(corpus, { category: "builtin", id: "not_a_builtin_qq" }).match,
    ).toBeNull()
  })

  test("unknown category returns null (untrusted input)", () => {
    const r = describe(corpus, {
      category: "bogus" as never,
      id: "whatever",
    })
    expect(r.match).toBeNull()
  })

  test("NO_-prefixed option is NOT auto-normalized (describe is strict)", () => {
    // unlike zsh_classify / zsh_lookup_option, describe rejects NO_AUTO_CD
    // because the canonical id is `autocd`.
    expect(
      describe(corpus, { category: "option", id: "NO_AUTO_CD" }).match,
    ).toBeNull()
  })

  test("membership check: raw string is never minted into a brand", () => {
    // feed a string that happens to collide with a different category's id
    // — reserved_word "if" — against category=builtin; must reject.
    expect(describe(corpus, { category: "builtin", id: "if" }).match).toBeNull()
  })
})
