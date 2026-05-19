import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { mkDocumented } from "../../docs/brands"
import { docCategoryPreamble } from "../../docs/category-preamble"
import type { DocCorpus } from "../../docs/corpus"
import * as zd from "../../docs/corpus"
import type { DocCategory, DocRecordMap } from "../../docs/taxonomy"
import { docCategories, docId } from "../../docs/taxonomy"
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
import { mkOptFlag, mkRedirOp } from "../../docs/types"
import { dumpFile, dumpText, writeRefDump } from "../../render/dump"
import {
  defaultStateIn,
  fmtOptRefsInMd,
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

const sf = stub("subscript_flag", "flag", "(w)", {
  desc: "d:sf",
  args: ["string"],
})
const pf = stub("param_expn_flag", "flag", "(U)", { desc: "d:pf" })
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
  special_function: [sfn],
  comp_utility: [cuu],
}

function mkTestCorpus(overrides: Partial<DocArrays> = {}): DocCorpus {
  const all = { ...baseArrays, ...overrides }
  const out: Record<string, unknown> = {}
  for (const k of docCategories) {
    const getId = docId[k] as (d: unknown) => string
    out[k] = new Map(all[k].map(d => [getId(d), d]))
  }
  return out as unknown as DocCorpus
}

const corpus = (o: Partial<DocArrays> = {}) => refDocs(mkTestCorpus(o))

const containsAll = (text: string | undefined, parts: readonly string[]) => {
  for (const p of parts) expect(text).toContain(p)
}

const headings = (t: string | undefined) => (t?.match(/^## /gm) ?? []).length

// --- case tables ------------------------------------------------------------

const renderedMarkdownCases = [
  [
    "special_param",
    mdShellParam(sec),
    ["`SECONDS`", "d:p", "Special Parameter"],
  ],
  [
    "builtin",
    mdBuiltin(bi),
    ["`echo`", "```zsh", "echo [ -n ] [ arg ... ]", "d:bi"],
  ],
  [
    "precmd_modifier",
    mdPrecmd(pc),
    ["`noglob`", "_Role:_ precommand modifier"],
  ],
  [
    "redirection",
    mdRedir(rd),
    ["`>>`", "```zsh", ">> word", "d:r", "Redirection"],
  ],
  [
    "process_subst",
    mdProcessSubst(sub),
    ["`<(...)`", "d:ps", "_Category:_ Process Substitution"],
  ],
  [
    "param_expn",
    mdParamExpn(px),
    [
      "`${name:-word}`",
      "_(default, form 2 of 2)_",
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
    ["`if`", "d:rw", "_Role:_ reserved word (command position)"],
  ],
  [
    "reserved_word no-desc",
    mdReservedWord({
      name: mkDocumented("reserved_word", "for"),
      sig: "for",
      section: "Reserved Words",
      pos: "command",
    }),
    ["`for`", "_Role:_ reserved word (command position)"],
  ],
  [
    "complex_command",
    mdComplexCommand(cc, mkTestCorpus({ option: [] })),
    [
      "`if`",
      "```zsh",
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
    ["`%n`", "d:pe", "_Category:_ Prompt Escape — Login information"],
  ],
  [
    "zle_widget",
    mdZleWidget(zw),
    [
      "`backward-kill-word`",
      "```zsh",
      "backward-kill-word (^W ESC-^H ESC-^?) (unbound) (unbound)",
      "d:zw",
      "_Role:_ ZLE standard widget",
      "_Subsection:_ Modifying Text",
    ],
  ],
  [
    "keymap",
    mdKeymap(km),
    ["`emacs`", "d:km", "_Role:_ ZLE keymap", "_Linked from:_ `main`"],
  ],
  ["job_spec", mdJobSpec(js), ["`%%`", "d:js", "_Role:_ job spec (current)"]],
  [
    "arith_op",
    mdArithOp(ao),
    ["`+`", "d:ao", "_Role:_ arithmetic operator (overloaded)"],
  ],
  [
    "special_function",
    mdSpecialFunction(sfn),
    [
      "`chpwd`",
      "d:sfn",
      "```zsh",
      "chpwd_functions=( funcname1 funcname2 ... )",
      "_Role:_ hook function",
    ],
  ],
] as const

const noOpts = mkTestCorpus({ option: [] })
const cdCorpus = mkTestCorpus({ option: [cd] })

const compactMarkdownCases = [
  [
    "subscript_flag",
    mdSubscriptFlag(sf, noOpts),
    ["`(w)`", "d:sf", "_Role:_ parameter-subscript flag (args: string)"],
  ],
  [
    "param_expn_flag",
    mdParamFlag(pf, noOpts),
    ["`(U)`", "d:pf", "_Role:_ parameter-expansion flag"],
  ],
  [
    "history_expn",
    mdHistory(hi, noOpts),
    ["`!!`", "d:hi", "_Role:_ history event designator"],
  ],
  [
    "glob_op",
    mdGlobOp(go, noOpts),
    ["`*`", "d:go", "_Role:_ glob operator (standard)"],
  ],
  [
    "glob_flag",
    mdGlobFlag(gf, noOpts),
    ["`i`", "d:gf", "_Role:_ glob flag (args: expr)"],
  ],
  [
    "glob_qualifier",
    mdGlobQualifier(gq, noOpts),
    ["`@`", "d:gq", "_Role:_ glob qualifier"],
  ],
  [
    "comp_utility",
    mdCompUtility(cuu),
    ["`_all_labels`", "d:cuu", "_Category:_ Completion Utility"],
  ],
] as const

// --- tests ------------------------------------------------------------------

describe("render markdown", () => {
  test("option markdown", () => {
    containsAll(mdOpt(cd, noOpts), [
      "`AUTO_CD`",
      "```zsh",
      "setopt auto_cd",
      "unsetopt auto_cd",
      "set -J",
      "set +J",
      "**Default in zsh: `on`**",
      "_Option category:_ Changing Directories",
    ])
  })

  test("option refs — prose variants", () => {
    expect(fmtOptRefsInMd("AUTO_CD AUTOCD NO_AUTO_CD NOAUTOCD", cdCorpus)).toBe(
      "**`AUTO_CD`** **`AUTOCD`** **`NO_AUTO_CD`** **`NOAUTOCD`**",
    )
  })

  test("option refs — skip vars and code fences", () => {
    // prettier-ignore
    const input =
      "$AUTO_CD ${AUTO_CD} $NO_AUTO_CD ${NOAUTOCD}\n" +
      "`AUTO_CD` AUTO_CD\n```zsh\nAUTO_CD\n```\nAUTOCD"
    // Backticked option references (e.g. from `tt(AUTO_CD)` upstream) are
    // bold-promoted the same as bare ones; fenced code is untouched.
    const want =
      "$AUTO_CD ${AUTO_CD} $NO_AUTO_CD ${NOAUTOCD}\n" +
      "**`AUTO_CD`** **`AUTO_CD`**\n```zsh\nAUTO_CD\n```\n**`AUTOCD`**"
    expect(fmtOptRefsInMd(input, cdCorpus)).toBe(want)
  })

  test("option refs — only known", () => {
    expect(fmtOptRefsInMd("AUTO_CD CDPATH POSIX", cdCorpus)).toBe(
      "**`AUTO_CD`** CDPATH POSIX",
    )
  })

  test("cond op markdown", () => {
    expect(mdCondOp(cu, noOpts)).toBe("`-a` *file*\n\nd:u")
    expect(mdCondOp(cb, noOpts)).toBe("*left* `-nt` *right*\n\nd:b")
  })

  test.each(renderedMarkdownCases)("%s markdown", (_, md, parts) => {
    containsAll(md, parts)
  })

  test.each(compactMarkdownCases)("%s markdown", (_, md, parts) => {
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

  test.each(
    preambleCases,
  )("%s dump starts with the category preamble", (k, preamble) => {
    const body = refFiles.get(dumpFile.forCat(k)) ?? ""
    expect(body.startsWith("<!-- preamble for category -->")).toBe(true)
    expect(body).toContain(preamble)
    expect(body.indexOf(preamble)).toBeLessThan(
      body.indexOf(`## ${headingOf(k)}`),
    )
  })

  test.each(
    preambleCases,
  )("all.md does NOT contain %s preamble", (_k, preamble) => {
    expect(refFiles.get(dumpFile.all)).not.toContain(preamble)
  })

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

    for (const kind of docCategories) {
      const file = dumpFile.forCat(kind)
      const src = [...vendored[kind].values()]
      test(`${file} covers ${kind}`, () => {
        expect(docs.filter(d => d.kind === kind)).toHaveLength(src.length)
        expect(headings(files.get(file))).toBe(src.length)
      })
    }

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
