import { loadCorpus } from "@carlwr/zsh-core"
import { describe, expect, test } from "vitest"
import { docs } from "../../../index.ts"

const corpus = loadCorpus()

describe("docs — single-category lookups (no `category` set)", () => {
  test.each([
    { key: "AUTO_CD", category: "option", id: "autocd" },
    { key: "autocd", category: "option", id: "autocd" },
    { key: "echo", category: "builtin", id: "echo" },
    { key: "errRET_urn", category: "option", id: "errreturn" },
    { key: "%n", category: "prompt_escape", id: "%n" },
    {
      key: "backward-kill-word",
      category: "zle_widget",
      id: "backward-kill-word",
    },
  ])("$key → $category:$id", ({ key, category, id }) => {
    const r = docs(corpus, { key })
    const m = r.matches[0]
    expect(m).toBeDefined()
    expect(m?.category).toBe(category)
    expect(m?.id).toBe(id)
    expect(m?.mdBody.length).toBeGreaterThan(0)
    expect(m?.display.length).toBeGreaterThan(0)
  })

  test("display preserves option human form", () => {
    expect(docs(corpus, { key: "auto_cd" }).matches[0]?.display).toBe("AUTO_CD")
  })

  test("no match returns empty matches[]", () => {
    const r = docs(corpus, { key: "definitely_not_a_zsh_thing_qq" })
    expect(r.matches).toEqual([])
    expect(r.matchesReturned).toBe(0)
    expect(r.matchesTotal).toBe(0)
  })

  test("empty/whitespace key returns empty matches[]", () => {
    expect(docs(corpus, { key: "" }).matches).toEqual([])
    expect(docs(corpus, { key: "   " }).matches).toEqual([])
  })
})

describe("docs — multi-match (no `category`)", () => {
  test("`for` resolves in both complex_command and reserved_word", () => {
    const r = docs(corpus, { key: "for" })
    const cats = r.matches.map(m => m.category)
    expect(cats).toContain("complex_command")
    expect(cats).toContain("reserved_word")
    expect(r.matchesReturned).toBe(r.matches.length)
    expect(r.matchesTotal).toBe(r.matches.length)
  })

  test("matches[] follows resolver-walk order (complex_command before reserved_word)", () => {
    const r = docs(corpus, { key: "for" })
    const ic = r.matches.findIndex(m => m.category === "complex_command")
    const ir = r.matches.findIndex(m => m.category === "reserved_word")
    expect(ic).toBeLessThan(ir)
  })

  test("`nocorrect` resolves in both precmd and option", () => {
    const r = docs(corpus, { key: "nocorrect" })
    const cats = r.matches.map(m => m.category)
    expect(cats).toContain("precmd")
    expect(cats).toContain("option")
  })

  test.each([
    "0",
    "a",
  ])("bare history component `%s` is not a history match", key => {
    const r = docs(corpus, { key })
    expect(r.matches.map(m => m.category)).not.toContain("history")
  })
})

describe("docs — `category` constrains the lookup", () => {
  test("category=builtin, key=echo → builtin:echo only", () => {
    const r = docs(corpus, { key: "echo", category: "builtin" })
    expect(r.matches.length).toBe(1)
    expect(r.matches[0]?.category).toBe("builtin")
    expect(r.matches[0]?.id).toBe("echo")
  })

  test("category=reserved_word, key=for → only reserved_word match", () => {
    const r = docs(corpus, { key: "for", category: "reserved_word" })
    expect(r.matches.length).toBe(1)
    expect(r.matches[0]?.category).toBe("reserved_word")
  })

  test("unknown category returns empty (untrusted input)", () => {
    const r = docs(corpus, { key: "echo", category: "bogus" as never })
    expect(r.matches).toEqual([])
  })

  test("known category, no resolution → empty", () => {
    const r = docs(corpus, { key: "not_a_builtin_qq", category: "builtin" })
    expect(r.matches).toEqual([])
  })

  test("with category=option, NO_-prefixed input still resolves (not strict)", () => {
    // Resolver semantics still apply inside the chosen category.
    const r = docs(corpus, { key: "NO_AUTO_CD", category: "option" })
    expect(r.matches[0]?.id).toBe("autocd")
  })
})

describe("docs — direct ∥ resolver, direct preferred (template-key categories)", () => {
  test("job_spec: direct hit on `%number` does NOT round-trip through `%string` resolver fallback", () => {
    const r = docs(corpus, { key: "%number", category: "job_spec" })
    expect(r.matches[0]?.id).toBe("%number")
  })

  test("job_spec: direct hit on `%string`", () => {
    const r = docs(corpus, { key: "%string", category: "job_spec" })
    expect(r.matches[0]?.id).toBe("%string")
  })

  test("job_spec: resolver fallback handles literal `%5`", () => {
    const r = docs(corpus, { key: "%5", category: "job_spec" })
    expect(r.matches[0]?.id).toBe("%number")
  })

  test("history: direct hit on `!n` does NOT fall through to resolver", () => {
    const r = docs(corpus, { key: "!n", category: "history" })
    expect(r.matches[0]?.id).toBe("!n")
  })

  test("history: resolver fallback handles literal `!42`", () => {
    const r = docs(corpus, { key: "!42", category: "history" })
    expect(r.matches[0]?.id).toBe("!n")
  })
})

describe("docs — option matches reached via NO_-stripping carry input-negated feedback", () => {
  test.each([
    { key: "NO_AUTO_CD", id: "autocd" },
    { key: "noautocd", id: "autocd" },
    { key: "NO_NOTIFY", id: "notify" },
  ])("$key → option:$id with feedback", ({ key, id }) => {
    const r = docs(corpus, { key, category: "option" })
    const m = r.matches[0]
    expect(m).toBeDefined()
    expect(m?.id).toBe(id)
    expect(m?.feedback).toEqual({ kind: "input-negated" })
  })

  test.each([
    { key: "AUTO_CD", id: "autocd" },
    { key: "autocd", id: "autocd" },
    { key: "NOTIFY", id: "notify" },
  ])("$key → option:$id without feedback", ({ key, id }) => {
    const r = docs(corpus, { key, category: "option" })
    const m = r.matches[0]
    expect(m).toBeDefined()
    expect(m?.id).toBe(id)
    expect(m).not.toHaveProperty("feedback")
  })

  test("non-option matches never carry `feedback` (key absent)", () => {
    const r = docs(corpus, { key: "echo" })
    const m = r.matches[0]
    expect(m).toBeDefined()
    expect(m).not.toHaveProperty("feedback")
  })
})

describe("docs — subKind on category branches", () => {
  test("reserved_word match carries `subKind` reflecting `pos`", () => {
    const r = docs(corpus, { key: "do", category: "reserved_word" })
    const m = r.matches[0]
    expect(m).toBeDefined()
    expect(m?.subKind).toBe("command")
  })

  test("job_spec match carries `subKind` reflecting `kind`", () => {
    const r = docs(corpus, { key: "%number", category: "job_spec" })
    const m = r.matches[0]
    expect(m).toBeDefined()
    expect(m?.subKind).toBe("number")
  })

  test("multi-match: reserved_word branch carries subKind, complex_command branch does not", () => {
    const r = docs(corpus, { key: "for" })
    const cc = r.matches.find(m => m.category === "complex_command")
    const rw = r.matches.find(m => m.category === "reserved_word")
    expect(cc).toBeDefined()
    expect(rw).toBeDefined()
    expect(cc).not.toHaveProperty("subKind")
    expect(rw?.subKind).toBe("command")
  })

  test("option match has no subKind key (option category has no sub-facet)", () => {
    const r = docs(corpus, { key: "AUTO_CD", category: "option" })
    const m = r.matches[0]
    expect(m).toBeDefined()
    expect(m).not.toHaveProperty("subKind")
  })
})

describe("docs — output envelope shape", () => {
  test("envelope fields are present even on empty result", () => {
    const r = docs(corpus, { key: "totally_not_real_qq" })
    expect(r).toMatchObject({
      matches: [],
      matchesReturned: 0,
      matchesTotal: 0,
    })
  })

  test("matchesReturned == matchesTotal (no truncation in docs)", () => {
    const r = docs(corpus, { key: "for" })
    expect(r.matchesReturned).toBe(r.matchesTotal)
  })
})
