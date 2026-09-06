import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { mkDocumented } from "../../docs/brands"
import { docCategoryPreamble } from "../../docs/category-preamble"
import type { DocCorpus } from "../../docs/corpus"
import * as zd from "../../docs/corpus"
import type { DocCategory, DocRecordMap } from "../../docs/taxonomy"
import { docCategories, idOf, mkPieceId } from "../../docs/taxonomy"
import type {
  ArithOpDoc,
  BuiltinDoc,
  ComplexCommandDoc,
  CompUtilityDoc,
  CondOpDoc,
  JobSpecDoc,
  KeymapDoc,
  ParamExpnDoc,
  PrecmdDoc,
  ProcessSubstDoc,
  PromptEscapeDoc,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  SpecialFunctionDoc,
  ZleWidgetDoc,
  ZshOption,
} from "../../docs/types"
import { mkOptFlag, mkRedirOp, mkShellParamKeyName } from "../../docs/types"
import { dumpFile, dumpText, writeRefDump } from "../../render/dump"
import {
  defaultStateIn,
  fmtOptRefsInMd,
  headFor,
  isDocoptSig,
  isSynonymList,
  mdArithOp,
  mdBuiltin,
  mdComplexCommand,
  mdCompUtility,
  mdCondOp,
  mdGlobFlag,
  mdGlobOp,
  mdGlobQualifier,
  mdHistory,
  mdJobSpec,
  mdKeymap,
  mdOpt,
  mdParamExpn,
  mdParamFlag,
  mdPrecmd,
  mdProcessSubst,
  mdPromptEscape,
  mdRedir,
  mdReservedWord,
  mdShellParam,
  mdSpecialFunction,
  mdSubscriptFlag,
  mdZleWidget,
  recordTitle,
  renderDocWithTitle,
} from "../../render/md"
import { refDocs } from "../../render/refs"
import { withTmpDirAsync } from "../tmp-dir"

// --- fixtures ---------------------------------------------------------------
// `section` and `args` are required by the types but unused by renderers.

const cd: ZshOption = {
  name: mkDocumented("option", "AUTO_CD"),
  display: "AUTO_CD",
  flags: [{ char: mkOptFlag("J"), on: "-" }],
  defaultIn: ["csh", "ksh", "sh", "zsh"],
  category: "Changing Directories",
  desc: "d:o",
}

const cond = <A extends CondOpDoc["arity"]>(
  arity: A,
  op: string,
  operands: Extract<CondOpDoc, { arity: A }>["operands"],
  desc: string,
): CondOpDoc =>
  ({
    op: mkDocumented("conditional_op", op),
    operands,
    desc,
    arity,
  }) as CondOpDoc

const cu = cond("unary", "-a", ["file"], "d:u")
const cb = cond("binary", "-nt", ["left", "right"], "d:b")

const bi: BuiltinDoc = {
  name: mkDocumented("builtin", "echo"),
  synopsis: ["echo [ -n ] [ arg ... ]"],
  desc: "d:bi",
}
const pc: PrecmdDoc = {
  name: "noglob",
  synopsis: ["noglob command arg ..."],
  desc: "d:pc",
}
const rd: RedirDoc = {
  groupOp: mkRedirOp(">>"),
  slug: mkDocumented("redirection", ">>_word"),
  sig: ">> word",
  desc: "d:r",
  section: "",
}
const sub: ProcessSubstDoc = {
  op: "<(...)",
  sig: "<(list)",
  desc: "d:ps",
  section: "",
}
const px: ParamExpnDoc = {
  sig: mkDocumented("param_expn", "${name:-word}"),
  groupSigs: ["${name-word}", "${name:-word}"],
  orderInGroup: 1,
  subKind: "default",
  placeholders: ["name", "word"],
  desc: "d:px",
  section: "Parameter Expansion",
}
const word: ReservedWordDoc = {
  name: mkDocumented("reserved_word", "if"),
  sig: "if list then list fi",
  desc: "d:rw",
  section: "",
  pos: "command",
}
const cc: ComplexCommandDoc = {
  name: mkDocumented("complex_command", "if"),
  sig: "if list then list fi",
  desc: "d:cc",
  section: "Complex Commands",
  alternateForms: [{ template: "if list { list }", keywords: [] }],
  bodyKeywords: ["then", "fi"],
}
const sec: ShellParamDoc = {
  name: mkDocumented("special_param", "SECONDS"),
  sig: "SECONDS",
  desc: "d:p",
  scope: "shell-set",
}
// Flag/key/op-shaped fixtures: TS can't propagate K↔idField through a computed key.
const stub = <K extends DocCategory>(
  cat: K,
  idField: "flag" | "key" | "op",
  value: string,
  extra: object = {},
): DocRecordMap[K] =>
  ({
    [idField]: mkDocumented(cat, value),
    args: [],
    sig: value,
    desc: "",
    section: "",
    ...extra,
  }) as unknown as DocRecordMap[K]

const sf = stub("subscript_flag", "flag", "w", {
  desc: "d:sf",
  args: ["string"],
})
const pf = stub("param_expn_flag", "flag", "U", { desc: "d:pf" })
const hi = stub("history_expn", "key", "!!", {
  kind: "event-designator",
  desc: "d:hi",
})
const go = stub("glob_op", "op", "*", { kind: "standard", desc: "d:go" })
const gf = stub("glob_flag", "flag", "i", { desc: "d:gf", args: ["expr"] })
const gq = stub("glob_qualifier", "flag", "@", { desc: "d:gq", args: [] })

const pe: PromptEscapeDoc = {
  key: mkDocumented("prompt_escape", "%n"),
  sig: "%n",
  desc: "d:pe",
  section: "Login information",
}
const zw: ZleWidgetDoc = {
  name: mkDocumented("zle_widget", "backward-kill-word"),
  sig: "backward-kill-word (^W ESC-^H ESC-^?) (unbound) (unbound)",
  desc: "d:zw",
  section: "Modifying Text",
  kind: "standard",
}
const km: KeymapDoc = {
  name: mkDocumented("keymap", "emacs"),
  sig: "emacs",
  desc: "d:km",
  section: "Keymaps",
  isSpecial: false,
  linkedFrom: ["main"],
}
const js: JobSpecDoc = {
  key: mkDocumented("job_spec", "%%"),
  sig: "%%",
  desc: "d:js",
  section: "Jobs",
  kind: "current",
}
const ao: ArithOpDoc = {
  op: mkDocumented("arith_op", "+"),
  sig: "+",
  desc: "d:ao",
  section: "Arithmetic Evaluation",
  arity: "overloaded",
}
const sfn: SpecialFunctionDoc = {
  name: mkDocumented("special_function", "chpwd"),
  sig: "chpwd",
  desc: "d:sfn",
  section: "Hook Functions",
  kind: "hook",
  hookArray: "chpwd_functions",
}
const cuu: CompUtilityDoc = {
  name: mkDocumented("comp_utility", "_all_labels"),
  sig: "_all_labels [ -x ] [ -12VJ ] tag name descr [ command arg ... ]",
  synopsis: ["_all_labels [ -x ] [ -12VJ ] tag name descr [ command arg ... ]"],
  desc: "d:cuu",
  section: "Utility Functions",
}

// --- corpus builder ---------------------------------------------------------

type DocArrays = { readonly [K in DocCategory]: readonly DocRecordMap[K][] }

const baseArrays: DocArrays = {
  option: [cd],
  conditional_op: [cu],
  builtin: [bi],
  precmd_modifier: [pc],
  special_param: [sec],
  complex_command: [cc],
  reserved_word: [word],
  redirection: [rd],
  process_subst: [sub],
  param_expn: [px],
  subscript_flag: [sf],
  param_expn_flag: [pf],
  history_expn: [hi],
  glob_op: [go],
  glob_flag: [gf],
  glob_qualifier: [gq],
  prompt_escape: [pe],
  zle_widget: [zw],
  keymap: [km],
  job_spec: [js],
  arith_op: [ao],
  mathfunc: [],
  special_function: [sfn],
  comp_utility: [cuu],
}

function mkTestCorpus(overrides: Partial<DocArrays> = {}): DocCorpus {
  const all = { ...baseArrays, ...overrides }
  const out: Record<string, unknown> = {}
  for (const k of docCategories) {
    out[k] = new Map(all[k].map(d => [idOf(k, d), d]))
  }
  return out as unknown as DocCorpus
}

const corpus = (o: Partial<DocArrays> = {}) => refDocs(mkTestCorpus(o))

const containsAll = (text: string | undefined, parts: readonly string[]) => {
  for (const p of parts) expect(text).toContain(p)
}

const headings = (t: string | undefined) => (t?.match(/^## /gm) ?? []).length

// --- case tables ------------------------------------------------------------

const noOpts = mkTestCorpus({ option: [] })
const cdCorpus = mkTestCorpus({ option: [cd] })

// Title is composed downstream by `recordTitle` — body assertions below
// deliberately exclude the title line. See the `recordTitle` and
// `renderDocWithTitle` tests further down for title-related coverage.

const renderedMarkdownCases = [
  ["special_param", mdShellParam(sec), ["d:p", "Special Parameter"]],
  ["builtin", mdBuiltin(bi), ["```docopt", "echo [ -n ] [ arg ... ]", "d:bi"]],
  ["precmd_modifier", mdPrecmd(pc), ["_Role:_ precommand modifier"]],
  ["redirection", mdRedir(rd), ["```docopt", ">> word", "d:r", "Redirection"]],
  [
    "process_subst",
    mdProcessSubst(sub),
    ["d:ps", "_Category:_ Process Substitution"],
  ],
  [
    "param_expn",
    mdParamExpn(px),
    [
      "```zsh",
      "${name-word}",
      "${name:-word}    # <- this form",
      "d:px",
      "_Category:_ Parameter Expansion",
    ],
  ],
  [
    "reserved_word",
    mdReservedWord(word),
    ["d:rw", "_Role:_ reserved word (command position)"],
  ],
  [
    "reserved_word no-desc",
    mdReservedWord({
      name: mkDocumented("reserved_word", "for"),
      sig: "for",
      section: "Reserved Words",
      pos: "command",
    }),
    ["_Role:_ reserved word (command position)"],
  ],
  [
    "complex_command",
    mdComplexCommand(cc, noOpts),
    [
      "```docopt",
      "if list then list fi",
      "d:cc",
      "_Alternate forms:_",
      "if list { list }",
      "_Body keywords:_ `then` `fi`",
      "_Role:_ complex command",
    ],
  ],
  [
    "prompt_escape",
    mdPromptEscape(pe),
    [
      "```zsh",
      "print -P '%n'",
      "d:pe",
      "_Category:_ Prompt Escape — Login information",
    ],
  ],
  [
    "zle_widget",
    mdZleWidget(zw),
    [
      "```docopt",
      "backward-kill-word (^W ESC-^H ESC-^?) (unbound) (unbound)",
      "d:zw",
      "_Role:_ ZLE standard widget",
      "_Subsection:_ Modifying Text",
    ],
  ],
  [
    "keymap",
    mdKeymap(km),
    ["d:km", "_Role:_ ZLE keymap", "_Linked from:_ `main`"],
  ],
  ["job_spec", mdJobSpec(js), ["d:js", "_Role:_ job spec (current)"]],
  [
    "arith_op",
    mdArithOp(ao),
    ["d:ao", "_Role:_ arithmetic operator (overloaded)"],
  ],
  [
    "special_function",
    mdSpecialFunction(sfn),
    [
      "d:sfn",
      "```zsh",
      "chpwd_functions=( funcname1 funcname2 ... )",
      "_Role:_ hook function",
    ],
  ],
  [
    "subscript_flag",
    mdSubscriptFlag(sf, noOpts),
    [
      "```zsh",
      "${name[(w)exp]}",
      "d:sf",
      "_Role:_ parameter-subscript flag (args: string)",
    ],
  ],
  [
    "param_expn_flag",
    mdParamFlag(pf, noOpts),
    ["```zsh", "${(U)spec}", "d:pf", "_Role:_ parameter-expansion flag"],
  ],
  [
    "history_expn",
    mdHistory(hi, noOpts),
    ["d:hi", "_Role:_ history event designator"],
  ],
  [
    "glob_op",
    mdGlobOp(go, noOpts),
    ["d:go", "_Role:_ glob operator (standard)"],
  ],
  [
    "glob_flag",
    mdGlobFlag(gf, noOpts),
    ["```zsh", "(#i)pat", "d:gf", "_Role:_ glob flag (args: expr)"],
  ],
  [
    "glob_qualifier",
    mdGlobQualifier(gq, noOpts),
    ["```zsh", "*(@)", "d:gq", "_Role:_ glob qualifier"],
  ],
  [
    "comp_utility",
    mdCompUtility(cuu),
    ["d:cuu", "_Category:_ Completion Utility"],
  ],
] as const

// --- tests ------------------------------------------------------------------

describe("render markdown", () => {
  test("option markdown", () => {
    containsAll(mdOpt(cd, noOpts), [
      "```zsh",
      "setopt auto_cd",
      "unsetopt auto_cd",
      "set -J",
      "set +J",
      "**Default in zsh: `on`**",
      "_Option category:_ Changing Directories",
    ])
  })

  // Backticked option references (e.g. from `tt(AUTO_CD)` upstream) are
  // bold-promoted the same as bare ones; fenced code and `$VAR`/`${VAR}`
  // expansions are untouched. Unknown option names pass through.
  test.each([
    [
      "prose variants",
      "AUTO_CD AUTOCD NO_AUTO_CD NOAUTOCD",
      "**`AUTO_CD`** **`AUTOCD`** **`NO_AUTO_CD`** **`NOAUTOCD`**",
    ],
    [
      "skip vars and code fences",
      "$AUTO_CD ${AUTO_CD} $NO_AUTO_CD ${NOAUTOCD}\n" +
        "`AUTO_CD` AUTO_CD\n```zsh\nAUTO_CD\n```\nAUTOCD",
      "$AUTO_CD ${AUTO_CD} $NO_AUTO_CD ${NOAUTOCD}\n" +
        "**`AUTO_CD`** **`AUTO_CD`**\n```zsh\nAUTO_CD\n```\n**`AUTOCD`**",
    ],
    ["only known", "AUTO_CD CDPATH POSIX", "**`AUTO_CD`** CDPATH POSIX"],
  ])("option refs — %s", (_label, input, want) => {
    expect(fmtOptRefsInMd(input, cdCorpus)).toBe(want)
  })

  test.each([
    [cu, "```zsh\n[[ -a file ]]\n```\n\nd:u"],
    [cb, "```zsh\n[[ left -nt right ]]\n```\n\nd:b"],
  ] as const)("cond op markdown — body only ($arity)", (op, want) => {
    expect(mdCondOp(op, noOpts)).toBe(want)
  })

  test.each(renderedMarkdownCases)("%s markdown", (_, md, parts) => {
    containsAll(md, parts)
  })

  test("reserved-word — any position", () => {
    expect(mdReservedWord({ ...word, pos: "any" })).toContain(
      "reserved word (any position)",
    )
  })

  test("default state by emulation", () => {
    expect(defaultStateIn(cd, "zsh")).toBe("on")
    expect(defaultStateIn({ ...cd, defaultIn: ["ksh"] }, "zsh")).toBe("off")
  })

  test("refDocs — collects and sorts special params", () => {
    const argv: ShellParamDoc = {
      ...sec,
      name: mkDocumented("special_param", "argv"),
      sig: "argv",
    }
    const ids = refDocs(
      mkTestCorpus({
        special_param: [sec, argv],
        redirection: [],
        process_subst: [],
        reserved_word: [],
      }),
    ).map(d => `${d.kind}:${d.id}`)
    expect(ids.filter(id => id.startsWith("special_param:"))).toEqual([
      "special_param:argv",
      "special_param:SECONDS",
    ])
  })

  test("typed ref-doc ids distinct from display headings", () => {
    const docs = corpus()
    const opt = docs.find(d => d.kind === "option")
    expect(opt?.id).toBe(mkDocumented("option", "AUTO_CD"))
    expect(opt?.heading).toBe("AUTO_CD")
    expect(docs.find(d => d.kind === "redirection")?.heading).toBe(">> word")
  })

  test.each([
    // brackets / braces / pipe
    "zmodload [ -is ] name ...",
    "-o [ order ]",
    "foo | bar",
    "{a,b,c}",
    // ellipses
    "name ...",
    "arg…",
    // *meta* placeholders
    "*pattern*",
    // bare whitespace separator
    "-A pat",
    "-M matchspec",
  ])("isDocoptSig accepts docopt-shaped %j", sig => {
    expect(isDocoptSig(sig)).toBe(true)
  })

  // bare flag / key / escape
  test.each(["-a", "--long", "-1", "nosort", "%n", "HOME"])(
    "isDocoptSig rejects %j",
    sig => {
      expect(isDocoptSig(sig)).toBe(false)
    },
  )

  // comma-separated bare identifiers (widget synonym lists) carve out from docopt
  test.each([
    ["foo, bar", true],
    ["history-incremental-search-backward, foo", true],
    // single item / non-identifier / brackets / spaces → not a synonym list
    ["foo", false],
    ["foo, [bar]", false],
    ["foo bar", false],
  ] as const)("isSynonymList(%j) → %s", (sig, want) => {
    expect(isSynonymList(sig)).toBe(want)
  })

  test("isDocoptSig rejects synonym list", () => {
    expect(isDocoptSig("foo, bar")).toBe(false)
  })

  test("recordTitle — per-category formatting", () => {
    expect(recordTitle("option", cd)).toBe("`AUTO_CD`")
    expect(recordTitle("conditional_op", cu)).toBe("`-a` *file*")
    expect(recordTitle("conditional_op", cb)).toBe("*left* `-nt` *right*")
    expect(recordTitle("builtin", bi)).toBe("`echo`")
    expect(recordTitle("precmd_modifier", pc)).toBe("`noglob`")
    expect(recordTitle("special_param", sec)).toBe("`SECONDS`")
    expect(recordTitle("complex_command", cc)).toBe("`if`")
    expect(recordTitle("reserved_word", word)).toBe("`if`")
    expect(recordTitle("redirection", rd)).toBe("`>>`")
    expect(recordTitle("process_subst", sub)).toBe("`<(...)`")
    expect(recordTitle("param_expn", px)).toBe(
      "`${name:-word}`    _(default, form 2 of 2)_",
    )
    expect(recordTitle("subscript_flag", sf)).toBe("`w`")
    expect(recordTitle("param_expn_flag", pf)).toBe("`U`")
    expect(recordTitle("history_expn", hi)).toBe("`!!`")
    expect(recordTitle("glob_op", go)).toBe("`*`")
    expect(recordTitle("glob_flag", gf)).toBe("`i`")
    expect(recordTitle("glob_qualifier", gq)).toBe("`@`")
    expect(recordTitle("prompt_escape", pe)).toBe("`%n`")
    expect(recordTitle("zle_widget", zw)).toBe("`backward-kill-word`")
    expect(recordTitle("keymap", km)).toBe("`emacs`")
    expect(recordTitle("job_spec", js)).toBe("`%%`")
    expect(recordTitle("arith_op", ao)).toBe("`+`")
    expect(recordTitle("special_function", sfn)).toBe("`chpwd`")
    expect(recordTitle("comp_utility", cuu)).toBe("`_all_labels`")
  })

  test("recordTitle — param_expn solo sig drops form-index decoration", () => {
    const solo: ParamExpnDoc = {
      ...px,
      sig: mkDocumented("param_expn", "${name}"),
      groupSigs: ["${name}"],
      orderInGroup: 0,
    }
    expect(recordTitle("param_expn", solo)).toBe("`${name}`    _(default)_")
  })

  test("renderDocWithTitle — composes title + body", () => {
    const docs = mkTestCorpus()
    const pid = mkPieceId("builtin", bi.name)
    const out = renderDocWithTitle(docs, pid)
    // Title is on the first line, body follows after a blank line.
    expect(out).toMatch(/^`echo`\n\n/)
    expect(out).toContain("d:bi")
  })

  test("headFor — returns structured head for head-emitting categories", () => {
    const builtinHead = headFor("builtin", bi)
    expect(builtinHead).toEqual({
      lang: "docopt",
      lines: ["echo [ -n ] [ arg ... ]"],
    })
    const condHead = headFor("conditional_op", cu)
    expect(condHead).toEqual({ lang: "zsh", lines: ["[[ -a file ]]"] })
    const arithHead = headFor("arith_op", ao)
    expect(arithHead).toEqual({
      lang: "zsh",
      lines: ["$(( + a ))", "$(( a + b ))"],
    })
  })

  test("headFor — head-less categories return undefined", () => {
    expect(headFor("keymap", km)).toBeUndefined()
    expect(headFor("job_spec", js)).toBeUndefined()
    expect(headFor("process_subst", sub)).toBeUndefined()
  })

  test("renderDocWithTitle — missing record returns empty string", () => {
    const docs = mkTestCorpus({ builtin: [] })
    const pid = mkPieceId("builtin", mkDocumented("builtin", "missing"))
    expect(renderDocWithTitle(docs, pid)).toBe("")
  })

  test("alternate-form requires annotation rendered as trailing comment", () => {
    const docWithReq: ComplexCommandDoc = {
      ...cc,
      alternateForms: [
        {
          template: "if list { list }",
          keywords: [],
          requires: ["SHORT_LOOPS"],
        },
        {
          template: "repeat word sublist",
          keywords: [],
          requires: ["SHORT_LOOPS", "SHORT_REPEAT"],
        },
        { template: "plain form", keywords: [] },
      ],
    }
    const md = mdComplexCommand(docWithReq, mkTestCorpus({ option: [] }))
    expect(md).toContain("if list { list }    # requires SHORT_LOOPS")
    expect(md).toContain(
      "repeat word sublist    # requires SHORT_LOOPS or SHORT_REPEAT",
    )
    // Forms without requires render bare — no trailing comment.
    expect(md).toMatch(/^plain form$/m)
  })

  test("member-list bullet — docopt sig becomes fenced docopt block", () => {
    // ShellParamDoc.keys feed renderMemberList; use a docopt-shaped key to
    // exercise the fenced-bullet path end to end.
    const doc: ShellParamDoc = {
      ...sec,
      name: mkDocumented("special_param", "PSEUDO"),
      sig: "PSEUDO",
      desc: "intro",
      keys: [
        {
          name: mkShellParamKeyName("[ key ] ..."),
          desc: "first para\n\nsecond para",
        },
        { name: mkShellParamKeyName("plainkey"), desc: "leaf desc" },
      ],
    }
    containsAll(mdShellParam(doc), [
      // docopt key: fenced bullet block, indented multi-paragraph desc
      "- ```docopt\n  [ key ] ...\n  ```",
      "  first para",
      "  second para",
      // plain key: inline form
      "- `plainkey`: leaf desc",
    ])
  })
})

describe("render dump", () => {
  const baseDocs = corpus()
  const refFiles = dumpText(baseDocs)
  const headingOf = (k: DocCategory) =>
    baseDocs.find(d => d.kind === k)?.heading ?? ""

  test("per-kind dump files", () => {
    const docs = corpus({ conditional_op: [cb] })
    const files = dumpText(docs)
    for (const doc of docs) {
      const h = `## ${doc.heading}`
      expect(files.get(dumpFile.forCat(doc.kind))).toContain(h)
      expect(files.get(dumpFile.all)).toContain(h)
    }
  })

  const preambleCases = docCategories.flatMap(k => {
    const p = docCategoryPreamble[k]
    return p === undefined ? [] : [[k, p] as const]
  })
  const noPreambleCats = docCategories.filter(k => !docCategoryPreamble[k])

  test.each(preambleCases)(
    "%s dump starts with the category preamble",
    (k, preamble) => {
      const body = refFiles.get(dumpFile.forCat(k)) ?? ""
      expect(body.startsWith("<!-- preamble for category -->")).toBe(true)
      expect(body).toContain(preamble)
      expect(body.indexOf(preamble)).toBeLessThan(
        body.indexOf(`## ${headingOf(k)}`),
      )
    },
  )

  test.each(preambleCases)(
    "all.md does NOT contain %s preamble",
    (_k, preamble) => {
      expect(refFiles.get(dumpFile.all)).not.toContain(preamble)
    },
  )

  test.each(noPreambleCats)("%s dump has no preamble marker", k => {
    expect(refFiles.get(dumpFile.forCat(k))).not.toContain(
      "<!-- preamble for category",
    )
  })

  test("writes dump files", async () => {
    await withTmpDirAsync("better-zsh-ref-", async dir => {
      const docs = corpus({ conditional_op: [cb] })
      await writeRefDump(dir, docs)
      const all = readFileSync(join(dir, dumpFile.all), "utf8")
      for (const doc of docs) {
        expect(all).toContain(`## ${doc.heading}`)
        expect(
          readFileSync(join(dir, dumpFile.forCat(doc.kind)), "utf8"),
        ).toContain(doc.md)
      }
    })
  })

  describe("vendored docs", () => {
    const vendored = zd.loadCorpus()
    const docs = refDocs(vendored)
    const files = dumpText(docs)

    test.each(docCategories)("%s dump covers every vendored record", kind => {
      const file = dumpFile.forCat(kind)
      const src = [...vendored[kind].values()]
      expect(docs.filter(d => d.kind === kind)).toHaveLength(src.length)
      expect(headings(files.get(file))).toBe(src.length)
    })

    // Vendored-option lookup that throws on miss; mdOpt rendered inline.
    const renderOpt = (name: string): string => {
      const opt = vendored.option.get(mkDocumented("option", name))
      if (!opt) throw new Error(`no vendored option: ${name}`)
      return mdOpt(opt, vendored)
    }

    test("formats real option cross-refs but not env vars", () => {
      const out = renderOpt("CD_SILENT")
      expect(out).toContain("**`AUTO_CD`**")
      expect(out).toContain("**`PUSHD_SILENT`**")
      expect(out).toContain("**`POSIX_CD`**")
      // CDPATH is an env var (not an option), so it gets the upstream
      // `tt()` backticks but never the bold-coded option treatment.
      expect(out).not.toContain("**`CDPATH`**")
    })

    test("keeps literal pseudo-calls in vendored option prose", () => {
      const globalMd = renderOpt("GLOBAL_RCS")
      const rcsMd = renderOpt("RCS")
      // Upstream marks pseudo-call names with `tt(zprofile())` etc. and
      // dotfile names with `tt(.zshenv)` etc.; `tt()` rendering now
      // backticks them, hence the assertion shape changed from naked
      // `zprofile()` to `` `zprofile()` ``.
      expect(globalMd).toContain(
        "startup files `zprofile()`, `zshrc()`, `zlogin()` and `zlogout()` will not be run.",
      )
      expect(globalMd).not.toContain(",,")
      expect(rcsMd).toContain(
        "After `zshenv()` is sourced on startup, source the `.zshenv`, `zprofile()`, `.zprofile`, `zshrc()`, `.zshrc`, `zlogin()`, `.zlogin`, and `.zlogout` files, as described in Files.",
      )
      expect(rcsMd).toContain("the `zshenv()` file is still sourced")
      expect(rcsMd).toContain("Files")
      expect(rcsMd).not.toContain(",,")
    })
  })
})
