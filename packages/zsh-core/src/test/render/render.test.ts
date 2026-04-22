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
  BuiltinDoc,
  CondOpDoc,
  ParamExpnDoc,
  PrecmdDoc,
  ProcessSubstDoc,
  PromptEscapeDoc,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  ZleWidgetDoc,
  ZshOption,
} from "../../docs/types"
import { mkOptFlag, mkRedirOp } from "../../docs/types"
import { dumpText, type RefDumpFile, writeRefDump } from "../../render/dump"
import {
  defaultStateIn,
  fmtOptRefsInMd,
  mdBuiltin,
  mdCondOp,
  mdGlobFlag,
  mdGlobOp,
  mdHistory,
  mdOpt,
  mdParamExpn,
  mdParamFlag,
  mdPrecmd,
  mdProcessSubst,
  mdPromptEscape,
  mdRedir,
  mdReservedWord,
  mdShellParam,
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
  ({ op: mkDocumented("cond_op", op), operands, desc, arity }) as CondOpDoc

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
  sig: mkDocumented("redir", ">> word"),
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
const sec: ShellParamDoc = {
  name: mkDocumented("shell_param", "SECONDS"),
  sig: "SECONDS",
  desc: "d:p",
  section: "",
}
// Stub-rendered categories: only the identifier is load-bearing — renderers
// return "TBD" regardless. Central helper bridges the K↔idField correlation
// TS can't propagate through a computed property key.
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
const pf = stub("param_flag", "flag", "(U)", { desc: "d:pf" })
const hi = stub("history", "key", "!!", {
  kind: "event-designator",
  desc: "d:hi",
})
const go = stub("glob_op", "op", "*", { kind: "standard", desc: "d:go" })
const gf = stub("glob_flag", "flag", "i", { desc: "d:gf", args: ["expr"] })

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

// --- corpus builder ---------------------------------------------------------

type DocArrays = { readonly [K in DocCategory]: readonly DocRecordMap[K][] }

const baseArrays: DocArrays = {
  option: [cd],
  cond_op: [cu],
  builtin: [bi],
  precmd: [pc],
  shell_param: [sec],
  reserved_word: [word],
  redir: [rd],
  process_subst: [sub],
  param_expn: [px],
  subscript_flag: [sf],
  param_flag: [pf],
  history: [hi],
  glob_op: [go],
  glob_flag: [gf],
  prompt_escape: [pe],
  zle_widget: [zw],
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
  ["shell_param", mdShellParam(sec), ["`SECONDS`", "d:p", "Shell Parameter"]],
  [
    "builtin",
    mdBuiltin(bi),
    ["`echo`", "```zsh", "echo [ -n ] [ arg ... ]", "d:bi"],
  ],
  ["precmd", mdPrecmd(pc), ["`noglob`", "_Role:_ precommand modifier"]],
  ["redir", mdRedir(rd), ["`>>`", "```zsh", ">> word", "d:r", "Redirection"]],
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
    "prompt_escape",
    mdPromptEscape(pe),
    ["`%n`", "d:pe", "_Category:_ Prompt Escape (Login information)"],
  ],
  [
    "zle_widget",
    mdZleWidget(zw),
    [
      "`backward-kill-word`",
      "```zsh",
      "backward-kill-word (^W ESC-^H ESC-^?) (unbound) (unbound)",
      "d:zw",
      "_Role:_ ZLE standard widget (Modifying Text)",
    ],
  ],
] as const

const noOptsCorpus = mkTestCorpus({ option: [] })

const stubMarkdownCases = [
  [
    "subscript_flag",
    mdSubscriptFlag(sf, noOptsCorpus),
    ["`(w)`", "d:sf", "_Role:_ subscript flag (args: string)"],
  ],
  [
    "param_flag",
    mdParamFlag(pf, noOptsCorpus),
    ["`(U)`", "d:pf", "_Role:_ parameter-expansion flag"],
  ],
  [
    "history",
    mdHistory(hi, noOptsCorpus),
    ["`!!`", "d:hi", "_Role:_ history event designator"],
  ],
  [
    "glob_op",
    mdGlobOp(go, noOptsCorpus),
    ["`*`", "d:go", "_Role:_ glob operator (standard)"],
  ],
  [
    "glob_flag",
    mdGlobFlag(gf, noOptsCorpus),
    ["`i`", "d:gf", "_Role:_ glob flag (args: expr)"],
  ],
] as const

// Dump metadata per category: file, heading, snippet. Used both for
// full-dump assertions and the vendored-docs coverage loop.
const dumpByCat: {
  readonly [K in DocCategory]: readonly [RefDumpFile, string, string]
} = {
  option: ["options.md", "## AUTO_CD", "d:o"],
  cond_op: ["cond-ops.md", "## -nt", "d:b"],
  builtin: ["builtins.md", "## echo", "d:bi"],
  precmd: ["precmds.md", "## noglob", "d:pc"],
  shell_param: ["shell-params.md", "## SECONDS", "`SECONDS`"],
  reserved_word: ["reserved-words.md", "## if", "d:rw"],
  redir: ["redirs.md", "## >> word", "d:r"],
  process_subst: ["process-substs.md", "## <(...)", "d:ps"],
  param_expn: ["param-expns.md", "## ${name:-word}", "d:px"],
  subscript_flag: ["subscript-flags.md", "## (w)", "d:sf"],
  param_flag: ["param-flags.md", "## (U)", "d:pf"],
  history: ["history.md", "## !!", "d:hi"],
  glob_op: ["glob-ops.md", "## *", "d:go"],
  glob_flag: ["glob-flags.md", "## i", "d:gf"],
  prompt_escape: ["prompt-escapes.md", "## %n", "d:pe"],
  zle_widget: ["zle-widgets.md", "## backward-kill-word", "d:zw"],
}

const dumpCases = docCategories.map(k => dumpByCat[k])

// --- tests ------------------------------------------------------------------

describe("render markdown", () => {
  const noOpts = mkTestCorpus({ option: [] })
  const cdCorpus = mkTestCorpus({ option: [cd] })

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
    const want =
      "$AUTO_CD ${AUTO_CD} $NO_AUTO_CD ${NOAUTOCD}\n" +
      "`AUTO_CD` **`AUTO_CD`**\n```zsh\nAUTO_CD\n```\n**`AUTOCD`**"
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

  test.each(stubMarkdownCases)("%s markdown", (_, md, parts) => {
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

  test("refDocs — collects and sorts shell params", () => {
    const argv: ShellParamDoc = {
      ...sec,
      name: mkDocumented("shell_param", "argv"),
      sig: "argv",
    }
    const ids = refDocs(
      mkTestCorpus({
        shell_param: [sec, argv],
        redir: [],
        process_subst: [],
        reserved_word: [],
      }),
    ).map(d => `${d.kind}:${d.id}`)
    expect(ids).toEqual([
      `option:${mkDocumented("option", "AUTO_CD")}`,
      "cond_op:-a",
      "builtin:echo",
      "precmd:noglob",
      "shell_param:argv",
      "shell_param:SECONDS",
      "param_expn:${name:-word}",
      "subscript_flag:(w)",
      "param_flag:(U)",
      "history:!!",
      "glob_op:*",
      "glob_flag:i",
      "prompt_escape:%n",
      "zle_widget:backward-kill-word",
    ])
  })

  test("typed ref-doc ids distinct from display headings", () => {
    const docs = corpus()
    const opt = docs.find(d => d.kind === "option")
    expect(opt?.id).toBe(mkDocumented("option", "AUTO_CD"))
    expect(opt?.heading).toBe("AUTO_CD")
    expect(docs.find(d => d.kind === "redir")?.heading).toBe(">> word")
  })
})

describe("render dump", () => {
  test("per-kind dump files", () => {
    const files = dumpText(corpus({ cond_op: [cb] }))
    for (const [file, heading] of dumpCases) {
      expect(files.get(file)).toContain(heading)
      expect(files.get("all.md")).toContain(heading)
    }
    expect(files.get("suspicious.md")).toBe("")
  })

  test("history.md starts with the category preamble", () => {
    const files = dumpText(corpus())
    // biome-ignore lint/style/noNonNullAssertion: table-driven presence
    const preamble = docCategoryPreamble.history!
    const history = files.get("history.md")
    expect(history).toBeDefined()
    expect(history?.startsWith("<!-- preamble for category -->")).toBe(true)
    expect(history).toContain(preamble)
    // Separator between preamble and first record.
    expect(history?.indexOf(preamble) ?? -1).toBeLessThan(
      history?.indexOf("## !!") ?? -1,
    )
  })

  test("all.md does NOT contain the history preamble", () => {
    const files = dumpText(corpus())
    // biome-ignore lint/style/noNonNullAssertion: table-driven presence
    const preamble = docCategoryPreamble.history!
    expect(files.get("all.md")).not.toContain(preamble)
  })

  test("categories without a preamble dump without the marker", () => {
    const files = dumpText(corpus())
    expect(files.get("options.md")).not.toContain("<!-- preamble for category")
    expect(files.get("builtins.md")).not.toContain("<!-- preamble for category")
  })

  test("writes dump files", async () => {
    await withTmpDirAsync("better-zsh-ref-", async dir => {
      await writeRefDump(dir, corpus({ cond_op: [cb] }))
      const all = readFileSync(join(dir, "all.md"), "utf8")
      for (const [file, heading, snippet] of dumpCases) {
        expect(all).toContain(heading)
        expect(readFileSync(join(dir, file), "utf8")).toContain(snippet)
      }
      expect(readFileSync(join(dir, "suspicious.md"), "utf8")).toBe("")
    })
  })

  describe("vendored docs", () => {
    const vendored = zd.loadCorpus()
    const docs = refDocs(vendored)
    const files = dumpText(docs)

    for (const kind of docCategories) {
      const [file] = dumpByCat[kind]
      const src = [...vendored[kind].values()]
      test(`${file} covers ${kind}`, () => {
        expect(docs.filter(d => d.kind === kind)).toHaveLength(src.length)
        expect(headings(files.get(file))).toBe(src.length)
      })
    }

    test("strips raw yodl markers", () => {
      // All dump files: rendered files must strip yodl macros; stubs are trivial.
      for (const [file] of dumpCases) {
        expect(files.get(file)).not.toContain("tt(")
        expect(files.get(file)).not.toContain("var(")
      }
    })

    test("avoids known suspicious patterns", () => {
      for (const [file, pattern] of [
        ["options.md", "See ."],
        ["options.md", "See \\ ."],
        ["cond-ops.md", "See ."],
      ] as const) {
        expect(files.get(file)).not.toContain(pattern)
      }
      expect(files.get("suspicious.md")).toBe("")
    })

    test("formats real option cross-refs but not env vars", () => {
      const cdSilent = vendored.option.get(mkDocumented("option", "CD_SILENT"))
      expect(cdSilent).toBeTruthy()
      // biome-ignore lint/style/noNonNullAssertion: asserted above
      const out = mdOpt(cdSilent!, vendored)
      expect(out).toContain("**`AUTO_CD`**")
      expect(out).toContain("**`PUSHD_SILENT`**")
      expect(out).toContain("**`POSIX_CD`**")
      expect(out).not.toContain("`CDPATH`")
    })

    test("keeps literal pseudo-calls in vendored option prose", () => {
      const globalRcs = vendored.option.get(
        mkDocumented("option", "GLOBAL_RCS"),
      )
      const rcs = vendored.option.get(mkDocumented("option", "RCS"))
      expect(globalRcs).toBeTruthy()
      expect(rcs).toBeTruthy()
      // biome-ignore lint/style/noNonNullAssertion: asserted above
      const globalMd = mdOpt(globalRcs!, vendored)
      // biome-ignore lint/style/noNonNullAssertion: asserted above
      const rcsMd = mdOpt(rcs!, vendored)
      expect(globalMd).toContain(
        "startup files zprofile(), zshrc(), zlogin() and zlogout() will not be run.",
      )
      expect(globalMd).not.toContain(",,")
      expect(rcsMd).toContain(
        "After zshenv() is sourced on startup, source the .zshenv, zprofile(), .zprofile, zshrc(), .zshrc, zlogin(), .zlogin, and .zlogout files, as described in Files.",
      )
      expect(rcsMd).toContain("the zshenv() file is still sourced")
      expect(rcsMd).toContain("Files")
      expect(rcsMd).not.toContain(",,")
    })
  })
})
