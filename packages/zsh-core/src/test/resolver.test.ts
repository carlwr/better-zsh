import { describe, expect, test } from "vitest"
import { mkDocumented } from "../docs/brands"
import { loadCorpus } from "../docs/corpus"
import { lookupRaw, resolve } from "../docs/resolver"
import { type DocCategory, docCategories, mkPieceId } from "../docs/taxonomy"

const corpus = loadCorpus()

// Per-cat helpers: `.hit(raw, id)` asserts resolve; `.miss(raw)` asserts unresolved.
function cases<K extends DocCategory>(cat: K) {
  return {
    hit: (raw: string, id: string) =>
      expect(resolve(corpus, cat, raw)).toEqual(
        mkPieceId(cat, mkDocumented(cat, id)),
      ),
    miss: (raw: string) => expect(resolve(corpus, cat, raw)).toBeUndefined(),
  }
}

describe("resolveHistory (event designators)", () => {
  const hist = cases("history_expn")
  test.each([
    ["!!", "!!"],
    ["!42", "!n"],
    ["!-3", "!-n"],
    ["!foo", "!str"],
    ["!?bar", "!?str[?]"],
    ["!?bar?", "!?str[?]"],
    ["!#", "!#"],
    ["!{...}", "!{...}"],
    ["!{foo}", "!{...}"],
    // ^old^new shorthand resolves to the `!!` record
    ["^old^new", "!!"],
    ["^old^new^", "!!"],
    // whitespace is trimmed
    ["  !42  ", "!n"],
  ])("%s -> %s", hist.hit)

  test.each([
    // word-designators / modifiers in isolation must NOT resolve
    "0",
    "a",
    "n",
    ":h",
    "h",
    // caret shorthand needs two `^` and a body before the second
    "^",
    "^^",
    "^foo",
    // lone `!` with no body
    "!",
    // `!!` with extra chars is not a bare designator
    "!!bogus",
    // `!$` is a word-designator, not `!str`
    "!$",
    // unrelated tokens
    "unrelated",
    "",
    "   ",
  ])("%s -> undefined", hist.miss)
})

describe("resolveRedir", () => {
  const redir = cases("redirection")
  test.each([
    // operator + tail
    ["> file", ">_word"],
    ["2>& 1", ">&_number"],
    ["<<EOF", "<<[-]_word"],
    ["<< EOF", "<<[-]_word"],
    ["<<-EOF", "<<[-]_word"],
    ["2<<EOF", "<<[-]_word"],
    ["2<<-EOF", "<<[-]_word"],
    // full sig form maps to the slug id
    ["> word", ">_word"],
    [">& number", ">&_number"],
    ["<<[-] word", "<<[-]_word"],
  ])("%s -> %s", redir.hit)

  test.each(["<<", "<<-"])(
    "incomplete here-doc %s does not resolve",
    redir.miss,
  )
})

describe("parens-agnostic flag resolvers", () => {
  // Verified via `zsh-data-assets.test.ts`: real corpus has bare-letter keys
  // (`w` subscript, `@` / `a` param, `i` glob). The resolver must accept both
  // the corpus-key form and the user-code parenthesized form.

  describe("subscript_flag", () => {
    const sub = cases("subscript_flag")
    test.each([
      ["w", "w"],
      ["(w)", "w"],
      ["e", "e"],
      ["(e)", "e"],
      // full-sig close-variant: strip args down to the bare flag letter
      ["e:string:", "e"],
      ["(e:string:)", "e"],
    ])("%s -> %s", sub.hit)
    test.each(["Z", "(Z)", "()", "(", ")", ""])("%s -> undefined", sub.miss)
  })

  describe("param_expn_flag", () => {
    const par = cases("param_expn_flag")
    test.each([
      ["@", "@"],
      ["(@)", "@"],
      ["U", "U"],
      ["(U)", "U"],
      ["j:string:", "j"],
      ["(j:string:)", "j"],
    ])("%s -> %s", par.hit)
    test.each(["Y", "(Y)", ""])("%s -> undefined", par.miss)
  })

  describe("glob_flag", () => {
    const gl = cases("glob_flag")
    test.each([
      ["i", "i"],
      ["(i)", "i"],
      ["(#i)", "i"],
      ["I", "I"],
      ["(#I)", "I"],
    ])("%s -> %s", gl.hit)
    test.each(["Z", "(Z)", "(#Z)", "(#)", ""])("%s -> undefined", gl.miss)
  })

  describe("glob_qualifier", () => {
    const gq = cases("glob_qualifier")
    test.each([
      ["/", "/"],
      ["(/)", "/"],
      ["(#q/)", "/"],
      ["@", "@"],
      ["(#q@)", "@"],
    ])("%s -> %s", gq.hit)
    test.each(["Z", "(Z)", "(#qZ)", "(#q)", ""])("%s -> undefined", gq.miss)
  })
})

describe("resolveJobSpec", () => {
  const job = cases("job_spec")
  test.each([
    ["%%", "%%"],
    ["%+", "%+"],
    ["%-", "%-"],
    ["%1", "%number"],
    ["%42", "%number"],
    ["%bash", "%string"],
    ["%?foo", "%?string"],
    ["  %1  ", "%number"],
  ])("%s -> %s", job.hit)

  test.each(["", "   ", "foo", "1", "%", "%?", "not-a-spec"])(
    "%s -> undefined",
    job.miss,
  )
})

describe("resolveSpecialFunction", () => {
  const fn = cases("special_function")
  test.each([
    ["chpwd", "chpwd"],
    ["precmd", "precmd"],
    ["TRAPDEBUG", "TRAPDEBUG"],
    ["TRAPEXIT", "TRAPEXIT"],
    ["TRAPZERR", "TRAPZERR"],
    // hook array → hook record
    ["precmd_functions", "precmd"],
    ["chpwd_functions", "chpwd"],
    // TRAP* template fallback — any uncategorized signal name
    ["TRAPHUP", "TRAPNAL"],
    ["TRAPUSR1", "TRAPNAL"],
    ["TRAPINT", "TRAPNAL"],
    // TRAPERR: not a literal corpus record (upstream treats it as xindex on
    // TRAPZERR), so it lands on the template.
    ["TRAPERR", "TRAPNAL"],
  ])("%s -> %s", fn.hit)

  test.each([
    "",
    "   ",
    // `_functions` only resolves for the closed hook set
    "foo_functions",
    "bar_functions",
    // TRAP must be followed by an uppercase/digit tail
    "TRAP",
    "TRAPfoo",
    "unrelated",
  ])("%s -> undefined", fn.miss)
})

describe("prompt_escape paired sigs (corpus-wide property)", () => {
  // Catches the regression where a `%X (%x)` header is parsed but only the
  // starter glyph is emitted. Pre-fix this failed on `%f`, `%b`, `%u`, `%s`,
  // `%k`. Scoped to paired sigs only — the corpus also contains keys that
  // legitimately include parentheses (e.g. `%)`, `%(x.true.false)`), so a
  // blanket `%\S+` scan over all sigs would be ambiguous.
  test("every paired '%X (%x)' sig has both glyphs resolvable", () => {
    const pair = /^(%\S+)\s+\(\s*(%\S+)\s*\)\s*$/
    const pe = cases("prompt_escape")
    let n = 0
    for (const doc of corpus.prompt_escape.values()) {
      const m = pair.exec(doc.sig)
      // Both groups are mandatory in the regex; guard each to narrow TS.
      if (!m?.[1] || !m[2]) continue
      n++
      for (const tok of [m[1], m[2]]) {
        try {
          pe.hit(tok, tok)
        } catch (err) {
          throw new Error(
            `sig=${doc.sig} token=${tok}: ${(err as Error).message}`,
          )
        }
      }
    }
    expect(n).toBeGreaterThan(0)
  })
})

describe("lookupRaw round-trip (corpus-wide)", () => {
  // Every documented id round-trips through `lookupRaw` to itself. Catches
  // resolvers whose template-key matching shadows the literal id (e.g. a
  // history `!n` corpus key getting recognized as `!str` instead).
  test.each(docCategories)("%s ids are stable under lookupRaw", cat => {
    const map = corpus[cat] as ReadonlyMap<string, unknown>
    if (map.size === 0) return
    const mismatched: { id: string; got: string | undefined }[] = []
    for (const id of map.keys()) {
      const pid = lookupRaw(corpus, cat, id)
      if (pid?.id !== id)
        mismatched.push({ id, got: pid?.id as string | undefined })
    }
    expect(mismatched).toEqual([])
  })
})
