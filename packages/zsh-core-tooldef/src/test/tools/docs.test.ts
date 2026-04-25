import { loadCorpus } from "@carlwr/zsh-core"
import { describe, expect, test } from "vitest"
import { docs } from "../../../index.ts"

const corpus = loadCorpus()

describe("docs — single-category lookups (no `category` set)", () => {
  test.each([
    { raw: "AUTO_CD", category: "option", id: "autocd" },
    { raw: "autocd", category: "option", id: "autocd" },
    { raw: "echo", category: "builtin", id: "echo" },
    { raw: "errRET_urn", category: "option", id: "errreturn" },
    { raw: "%n", category: "prompt_escape", id: "%n" },
    {
      raw: "backward-kill-word",
      category: "zle_widget",
      id: "backward-kill-word",
    },
  ])("$raw → $category:$id", ({ raw, category, id }) => {
    const r = docs(corpus, { raw })
    const m = r.matches[0]
    expect(m).toBeDefined()
    expect(m?.category).toBe(category)
    expect(m?.id).toBe(id)
    expect(m?.markdown.length).toBeGreaterThan(0)
    expect(m?.display.length).toBeGreaterThan(0)
  })

  test("display preserves option human form", () => {
    expect(docs(corpus, { raw: "auto_cd" }).matches[0]?.display).toBe("AUTO_CD")
  })

  test("no match returns empty matches[]", () => {
    const r = docs(corpus, { raw: "definitely_not_a_zsh_thing_qq" })
    expect(r.matches).toEqual([])
    expect(r.matchesReturned).toBe(0)
    expect(r.matchesTotal).toBe(0)
  })

  test("empty/whitespace raw returns empty matches[]", () => {
    expect(docs(corpus, { raw: "" }).matches).toEqual([])
    expect(docs(corpus, { raw: "   " }).matches).toEqual([])
  })
})

describe("docs — multi-match (no `category`)", () => {
  test("`for` resolves in both complex_command and reserved_word", () => {
    const r = docs(corpus, { raw: "for" })
    const cats = r.matches.map(m => m.category)
    expect(cats).toContain("complex_command")
    expect(cats).toContain("reserved_word")
    expect(r.matchesReturned).toBe(r.matches.length)
    expect(r.matchesTotal).toBe(r.matches.length)
  })

  test("matches[] follows classify-walk order (complex_command before reserved_word)", () => {
    const r = docs(corpus, { raw: "for" })
    const ic = r.matches.findIndex(m => m.category === "complex_command")
    const ir = r.matches.findIndex(m => m.category === "reserved_word")
    expect(ic).toBeLessThan(ir)
  })

  test("`nocorrect` resolves in both precmd and option", () => {
    const r = docs(corpus, { raw: "nocorrect" })
    const cats = r.matches.map(m => m.category)
    expect(cats).toContain("precmd")
    expect(cats).toContain("option")
  })
})

describe("docs — `category` constrains the lookup", () => {
  test("category=builtin, raw=echo → builtin:echo only", () => {
    const r = docs(corpus, { raw: "echo", category: "builtin" })
    expect(r.matches.length).toBe(1)
    expect(r.matches[0]?.category).toBe("builtin")
    expect(r.matches[0]?.id).toBe("echo")
  })

  test("category=reserved_word, raw=for → only reserved_word match", () => {
    const r = docs(corpus, { raw: "for", category: "reserved_word" })
    expect(r.matches.length).toBe(1)
    expect(r.matches[0]?.category).toBe("reserved_word")
  })

  test("unknown category returns empty (untrusted input)", () => {
    const r = docs(corpus, { raw: "echo", category: "bogus" as never })
    expect(r.matches).toEqual([])
  })

  test("known category, no resolution → empty", () => {
    const r = docs(corpus, { raw: "not_a_builtin_qq", category: "builtin" })
    expect(r.matches).toEqual([])
  })

  test("with category=option, NO_-prefixed input still resolves (not strict)", () => {
    // `category` constrains the search to one category; per-category
    // resolver semantics still apply. So `NO_AUTO_CD` resolves to autocd.
    const r = docs(corpus, { raw: "NO_AUTO_CD", category: "option" })
    expect(r.matches[0]?.id).toBe("autocd")
  })
})

describe("docs — direct ∥ resolver, direct preferred (template-key categories)", () => {
  test("job_spec: direct hit on `%number` does NOT round-trip through `%string` resolver fallback", () => {
    const r = docs(corpus, { raw: "%number", category: "job_spec" })
    expect(r.matches[0]?.id).toBe("%number")
  })

  test("job_spec: direct hit on `%string`", () => {
    const r = docs(corpus, { raw: "%string", category: "job_spec" })
    expect(r.matches[0]?.id).toBe("%string")
  })

  test("job_spec: resolver fallback handles literal `%5`", () => {
    const r = docs(corpus, { raw: "%5", category: "job_spec" })
    expect(r.matches[0]?.id).toBe("%number")
  })

  test("history: direct hit on `!n` does NOT fall through to resolver", () => {
    const r = docs(corpus, { raw: "!n", category: "history" })
    expect(r.matches[0]?.id).toBe("!n")
  })

  test("history: resolver fallback handles literal `!42`", () => {
    const r = docs(corpus, { raw: "!42", category: "history" })
    expect(r.matches[0]?.id).toBe("!n")
  })
})

describe("docs — option matches always carry `negated`", () => {
  test.each([
    { raw: "AUTO_CD", id: "autocd", negated: false },
    { raw: "autocd", id: "autocd", negated: false },
    { raw: "NO_AUTO_CD", id: "autocd", negated: true },
    { raw: "NOTIFY", id: "notify", negated: false },
    { raw: "NO_NOTIFY", id: "notify", negated: true },
  ])("$raw → option:$id (negated=$negated)", ({ raw, id, negated }) => {
    const r = docs(corpus, { raw, category: "option" })
    const m = r.matches[0]
    expect(m).toBeDefined()
    expect(m?.id).toBe(id)
    expect(m?.negated).toBe(negated)
  })

  test("non-option matches do NOT carry `negated` (key absent)", () => {
    const r = docs(corpus, { raw: "echo" })
    const m = r.matches[0]
    expect(m).toBeDefined()
    expect(m).not.toHaveProperty("negated")
  })
})

describe("docs — output envelope shape", () => {
  test("envelope fields are present even on empty result", () => {
    const r = docs(corpus, { raw: "totally_not_real_qq" })
    expect(r).toMatchObject({
      matches: [],
      matchesReturned: 0,
      matchesTotal: 0,
    })
  })

  test("matchesReturned == matchesTotal (no truncation in docs)", () => {
    const r = docs(corpus, { raw: "for" })
    expect(r.matchesReturned).toBe(r.matchesTotal)
  })
})
