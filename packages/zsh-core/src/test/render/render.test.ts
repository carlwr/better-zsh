import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import type { DocCorpus } from "../../docs/corpus"
import * as zd from "../../docs/corpus"
import type { DocCategory, DocRecordMap } from "../../docs/taxonomy"
import { docCategories, docId } from "../../docs/taxonomy"
import type {
  BuiltinDoc,
  CondOpDoc,
  PrecmdDoc,
  ProcessSubstDoc,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  ZshOption,
} from "../../docs/types"
import { mkOptFlag, mkProven, mkRedirOp } from "../../docs/types"
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
  mdParamFlag,
  mdPrecmd,
  mdProcessSubst,
  mdRedir,
  mdReservedWord,
  mdShellParam,
  mdSubscriptFlag,
} from "../../render/md"
import { refDocs } from "../../render/refs"
import { withTmpDirAsync } from "../tmp-dir"

// --- fixtures ---------------------------------------------------------------
// `section` and `args` are required by the types but unused by renderers.

const cd: ZshOption = {
  name: mkProven("option", "AUTO_CD"),
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
  ({ op: mkProven("cond_op", op), operands, desc, arity }) as CondOpDoc

const cu = cond("unary", "-a", ["file"], "d:u")
const cb = cond("binary", "-nt", ["left", "right"], "d:b")

const bi: BuiltinDoc = {
  name: mkProven("builtin", "echo"),
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
  sig: mkProven("redir", ">> word"),
  desc: "d:r",
  section: "",
}
const sub: ProcessSubstDoc = {
  op: "<(...)",
  sig: "<(list)",
  desc: "d:ps",
  section: "",
}
const word: ReservedWordDoc = {
  name: mkProven("reserved_word", "if"),
  sig: "if list then list fi",
  desc: "d:rw",
  section: "",
  pos: "command",
}
const sec: ShellParamDoc = {
  name: mkProven("shell_param", "SECONDS"),
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
    [idField]: mkProven(cat, value),
    args: [],
    sig: value,
    desc: "",
    section: "",
    ...extra,
  }) as unknown as DocRecordMap[K]

const sf = stub("subscript_flag", "flag", "(w)")
const pf = stub("param_flag", "flag", "(U)")
const hi = stub("history", "key", "!!", { kind: "event-designator" })
const go = stub("glob_op", "op", "*")
const gf = stub("glob_flag", "flag", "i")

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
  subscript_flag: [sf],
  param_flag: [pf],
  history: [hi],
  glob_op: [go],
  glob_flag: [gf],
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
    "reserved_word",
    mdReservedWord(word),
    ["`if`", "d:rw", "_Role:_ reserved word (command position)"],
  ],
] as const

const stubMarkdownCases = [
  ["subscript_flag", mdSubscriptFlag(sf)],
  ["param_flag", mdParamFlag(pf)],
  ["history", mdHistory(hi)],
  ["glob_op", mdGlobOp(go)],
  ["glob_flag", mdGlobFlag(gf)],
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
  subscript_flag: ["subscript-flags.md", "## (w)", "TBD"],
  param_flag: ["param-flags.md", "## (U)", "TBD"],
  history: ["history.md", "## !!", "TBD"],
  glob_op: ["glob-ops.md", "## *", "TBD"],
  glob_flag: ["glob-flags.md", "## i", "TBD"],
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

  test.each(stubMarkdownCases)("%s is TBD", (_, md) => {
    expect(md).toBe("TBD")
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
      name: mkProven("shell_param", "argv"),
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
      `option:${mkProven("option", "AUTO_CD")}`,
      "cond_op:-a",
      "builtin:echo",
      "precmd:noglob",
      "shell_param:argv",
      "shell_param:SECONDS",
      "subscript_flag:(w)",
      "param_flag:(U)",
      "history:!!",
      "glob_op:*",
      "glob_flag:i",
    ])
  })

  test("typed ref-doc ids distinct from display headings", () => {
    const docs = corpus()
    const opt = docs.find(d => d.kind === "option")
    expect(opt?.id).toBe(mkProven("option", "AUTO_CD"))
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
      const cdSilent = vendored.option.get(mkProven("option", "CD_SILENT"))
      expect(cdSilent).toBeTruthy()
      // biome-ignore lint/style/noNonNullAssertion: asserted above
      const out = mdOpt(cdSilent!, vendored)
      expect(out).toContain("**`AUTO_CD`**")
      expect(out).toContain("**`PUSHD_SILENT`**")
      expect(out).toContain("**`POSIX_CD`**")
      expect(out).not.toContain("`CDPATH`")
    })
  })
})
