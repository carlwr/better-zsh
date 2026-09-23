import * as fcu from "@carlwr/fastcheck-utils"
import { isNonEmpty } from "@carlwr/typescript-extra"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { buildResolverFixture } from "../../scripts/resolver-fixture"
import { mkDocumented } from "../docs/brands"
import { loadCorpus } from "../docs/corpus"
import { type ResolverFeedback, resolve, resolveAll } from "../docs/resolver"
import { type DocCategory, docCategories } from "../docs/taxonomy"

const corpus = loadCorpus()

// Per-cat helpers: `.hit(raw, id, feedback?)` asserts the resolved hit;
// `.miss(raw)` asserts unresolved.
function cases<K extends DocCategory>(cat: K) {
  return {
    hit: (raw: string, id: string, feedback?: ResolverFeedback) => {
      const key = mkDocumented(cat, id)
      expect(resolve(corpus, cat, raw)).toEqual({
        record: corpus[cat].get(key),
        feedback,
      })
    },
    miss: (raw: string) => expect(resolve(corpus, cat, raw)).toBeUndefined(),
  }
}

const NEGATED: ResolverFeedback = { kind: "input-negated" }

describe("resolveOption (single-letter flags)", () => {
  const option = cases("option")
  // Plain-zsh letter table only: `-X` is LIST_TYPES (MARK_DIRS under sh/ksh),
  // `+f` is RCS (GLOB under sh/ksh), `-T` is CDABLE_VARS (TRAPS_ASYNC). A
  // flipped sign is the option's off state: `input-negated` feedback.
  test.each([
    ["-X", "listtypes"],
    ["+f", "rcs"],
    ["-f", "rcs", NEGATED],
    ["-T", "cdablevars"],
    ["-e", "errexit"],
    ["+e", "errexit", NEGATED],
    ["-J", "autocd"],
  ])("%s -> %s", option.hit)

  test.each([
    // sh/ksh-only letter (NOTIFY): a bad option in plain zsh
    "-b",
    // case-sensitive: `-J` is AUTO_CD, `-j` nothing
    "-j",
    // combined letters and command words are analysis, not identity
    "-ex",
    "set -J",
  ])("%s -> undefined", option.miss)
})

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
    // word-designators / modifiers are documented records: their literal key
    // hits directly, but no live token resolves to them (misses below)
    ["0", "0"],
    ["a", "a"],
    ["n", "n"],
    ["h", "h"],
    ["^", "^"],
    ["!", "!"],
  ])("%s -> %s", hist.hit)

  test.each([
    // a modifier in its live `:h` form is not a history token
    ":h",
    // caret shorthand needs two `^` and a body before the second
    "^^",
    "^foo",
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
    // the longest operator wins; `>` / `<` never claim a longer operator's token
    [">>", ">>_word"],
    ["<>", "<>_word"],
    [">|", ">|_word"],
    ["&>", "&>_word"],
    [">&file", ">&_word"],
    [">&-", ">&_-"],
  ])("%s -> %s", redir.hit)

  test.each([
    // incomplete here-doc
    "<<",
    "<<-",
    // `>&` / `<&` without an operand, or `<&` with one no record documents
    ">&",
    "<&",
    "2>&",
    "<&file",
    "<& file",
  ])("%s does not resolve", redir.miss)
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
    // `_functions` only resolves as a hook record's `hookArray`
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

describe("resolve round-trip (corpus-wide)", () => {
  // Every documented id round-trips through `resolve` to itself, and the hit
  // carries the corpus's own record — pins the direct-key step ahead of the
  // resolvers, without which template-key matching would shadow a literal id
  // (history `!n` recognized as `!str`).
  test.each(docCategories)("%s ids are stable under resolve", cat => {
    const map = corpus[cat] as ReadonlyMap<string, unknown>
    if (map.size === 0) return
    const mismatched: { id: string; got: string | undefined }[] = []
    for (const [id, rec] of map) {
      const hit = resolve(corpus, cat, id)
      if (hit?.record.id !== id || hit.record !== rec)
        mismatched.push({ id, got: hit?.record.id as string | undefined })
    }
    expect(mismatched).toEqual([])
  })

  // Categories whose id is a shell-safe slug distinct from the human-readable
  // `sig` (whitespace, argument placeholders): the close-variant resolver
  // must take the full-sig form to the slug id.
  test.each(["redirection", "param_expn_flag", "subscript_flag"] as const)(
    "%s sigs resolve to their slug id",
    cat => {
      const map = corpus[cat] as ReadonlyMap<string, { readonly sig: string }>
      const mismatched: { sig: string; id: string; got: string | undefined }[] =
        []
      let n = 0
      for (const [id, rec] of map) {
        if (!rec.sig || rec.sig === id) continue
        n++
        const pid = resolve(corpus, cat, rec.sig)
        if (pid?.record.id !== id)
          mismatched.push({
            sig: rec.sig,
            id,
            got: pid?.record.id as string | undefined,
          })
      }
      expect(n).toBeGreaterThan(0)
      expect(mismatched).toEqual([])
    },
  )
})

describe("resolve properties (corpus-wide)", () => {
  const opts = [...corpus.option.values()]
  if (!isNonEmpty(opts)) throw new Error("no options")
  // per-char random case, optional `_` before each char
  const spelled = fcu.element(opts).chain(o =>
    fc
      .tuple(
        ...[...o.id].map(ch => {
          const up = ch.toUpperCase()
          return fc.constantFrom(ch, up, `_${ch}`, `_${up}`)
        }),
      )
      .map(cs => ({ o, raw: cs.join("") })),
  )

  // Sound only while no option `x` coexists with an option `nox`.
  test("any case/underscore spelling of an option id resolves to it", () => {
    fc.assert(
      fc.property(spelled, ({ o, raw }) => {
        expect(resolve(corpus, "option", raw)).toEqual({ record: o })
      }),
    )
  })

  test("a no-prefixed spelling resolves input-negated", () => {
    fc.assert(
      fc.property(
        spelled,
        fcu.element(["no", "NO", "no_", "No_"]),
        ({ o, raw }, no) => {
          expect(resolve(corpus, "option", no + raw)).toEqual({
            record: o,
            feedback: NEGATED,
          })
        },
      ),
    )
  })

  // ASCII only: JS `trim` and Rust `str::trim` disagree beyond it (U+FEFF, U+0085).
  test("surrounding ASCII whitespace never changes the answer", () => {
    const { cases } = buildResolverFixture(corpus, {
      packageVersion: "0",
      dataHash: "0",
    })
    const catRaw = fcu.element(docCategories).chain(cat => {
      const inputs = cases[cat].map(c => c.input)
      const raw = isNonEmpty(inputs)
        ? fc.oneof(fcu.element(inputs), fc.string())
        : fc.string()
      return fc.tuple(fc.constant(cat), raw)
    })
    const ws = fc.string({
      unit: fcu.element([" ", "\t", "\n", "\r", "\v", "\f"]),
    })
    fc.assert(
      fc.property(catRaw, ws, ws, ([cat, raw], w1, w2) => {
        const bare = resolve(corpus, cat, raw)
        const padded = resolve(corpus, cat, w1 + raw + w2)
        expect(padded?.record).toBe(bare?.record)
        expect(padded?.feedback).toEqual(bare?.feedback)
      }),
    )
  })
})

describe("resolveAll (category walk)", () => {
  const categoriesOf = (raw: string) =>
    resolveAll(corpus, raw).map(hit => hit.record.category)

  test("walks classifyOrder: the richer record first on overlap", () => {
    expect(categoriesOf("for")).toEqual(["complex_command", "reserved_word"])
  })

  test.each<[string, DocCategory, DocCategory]>([
    // documented tie-breaks: tight identity resolvers beat option's
    // no_-stripping and job_spec's %string fallback
    ["nocorrect", "precmd_modifier", "option"],
    ["noglob", "precmd_modifier", "option"],
    ["TRAPHUP", "special_function", "option"],
    ["precmd_functions", "special_function", "option"],
    ["%n", "prompt_escape", "job_spec"],
  ])("%s -> %s before %s", (raw, winner, loser) => {
    const cats = categoriesOf(raw)
    const w = cats.indexOf(winner)
    const l = cats.indexOf(loser)
    expect(w).toBeGreaterThanOrEqual(0)
    expect(l === -1 || l > w).toBe(true)
  })

  test("hits carry their records and feedback", () => {
    const [hit] = resolveAll(corpus, "NO_AUTO_CD")
    if (hit?.record.category !== "option") {
      throw new Error("expected an option hit")
    }
    expect(hit.record).toBe(corpus.option.get(hit.record.id))
    expect(hit.feedback).toEqual({ kind: "input-negated" })
  })

  test("history: only event designators are tokens in a walk", () => {
    // Scoped lookup keeps the modifier/word-designator records reachable.
    expect(resolve(corpus, "history_expn", "h")?.record.subKind).toBe(
      "modifier",
    )
    expect(categoriesOf("h")).not.toContain("history_expn")
    expect(categoriesOf("!42")).toContain("history_expn")
  })

  test("nothing resolves: empty", () => {
    expect(resolveAll(corpus, "not-a-real-token")).toEqual([])
    expect(resolveAll(corpus, "")).toEqual([])
  })
})
