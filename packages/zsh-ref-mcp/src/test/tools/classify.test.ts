import { describe, expect, test } from "vitest"
import { loadCorpus } from "zsh-core"
import { classify } from "../../../index.ts"

const corpus = loadCorpus()

// Tie-break note: classify tries closed-identity categories first (see
// `classifyOrder` in src/tools/classify.ts) before the `option` category
// whose resolver does `no_`-stripping, so tokens like "nocorrect" (which
// is both a reserved word, a precmd modifier, and an option-via-negation)
// resolve deterministically to `reserved_word`. We deliberately exercise
// a handful of categories here; ambiguous tokens are noted but not tested
// exhaustively.

describe("classify", () => {
  test.each([
    { raw: "AUTO_CD", category: "option", id: "autocd" },
    { raw: "autocd", category: "option", id: "autocd" },
    { raw: "echo", category: "builtin", id: "echo" },
    { raw: "if", category: "reserved_word", id: "if" },
    { raw: "errRET_urn", category: "option", id: "errreturn" },
    { raw: "%n", category: "prompt_escape", id: "%n" },
    {
      raw: "backward-kill-word",
      category: "zle_widget",
      id: "backward-kill-word",
    },
  ])("$raw → $category:$id", ({ raw, category, id }) => {
    const result = classify(corpus, { raw })
    expect(result.match).not.toBeNull()
    expect(result.match?.category).toBe(category)
    expect(result.match?.id).toBe(id)
    expect(result.match?.markdown.length).toBeGreaterThan(0)
    expect(result.match?.display.length).toBeGreaterThan(0)
  })

  test("display preserves option human form", () => {
    expect(classify(corpus, { raw: "auto_cd" }).match?.display).toBe("AUTO_CD")
  })

  test("no match", () => {
    expect(
      classify(corpus, { raw: "definitely_not_a_zsh_thing_qq" }).match,
    ).toBeNull()
  })
})
