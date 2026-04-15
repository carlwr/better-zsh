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
  GlobFlagDoc,
  GlobOpDoc,
  HistoryDoc,
  ParamFlagDoc,
  PrecmdDoc,
  ProcessSubstDoc,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  SubscriptFlagDoc,
  ZshOption,
} from "../../docs/types"
import { mkOptFlagChar, mkProven, mkRedirOp } from "../../docs/types"
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
  mkMdCtx,
} from "../../render/md"
import { refDocs } from "../../render/refs"
import { withTmpDirAsync } from "../tmp-dir"

const opt = (name: string, desc: string): ZshOption => ({
  name: mkProven("option", name),
  display: name,
  flags: [{ char: mkOptFlagChar("J"), on: "-" }],
  defaultIn: ["csh", "ksh", "sh", "zsh"],
  category: "Changing Directories",
  desc,
})

const unary = (op: string, operand: string, desc: string): CondOpDoc => ({
  op: mkProven("cond_op", op),
  operands: [operand],
  desc,
  arity: "unary",
})

const binary = (
  op: string,
  left: string,
  right: string,
  desc: string,
): CondOpDoc => ({
  op: mkProven("cond_op", op),
  operands: [left, right],
  desc,
  arity: "binary",
})

const builtin = (name: string, synopsis: string, desc: string): BuiltinDoc => ({
  name: mkProven("builtin", name),
  synopsis: [synopsis],
  desc,
})

const precmd = (
  name: PrecmdDoc["name"],
  synopsis: string,
  desc: string,
): PrecmdDoc => ({
  name,
  synopsis: [synopsis],
  desc,
})

const redir = (groupOp: string, sig: string, desc: string): RedirDoc => ({
  groupOp: mkRedirOp(groupOp),
  sig: mkProven("redir", sig),
  desc,
  section: "Redirections",
})

const ps = (
  op: ProcessSubstDoc["op"],
  sig: ProcessSubstDoc["sig"],
  desc: string,
): ProcessSubstDoc => ({
  op,
  sig,
  desc,
  section: "Process Substitution",
})

const rw = (
  name: string,
  sig: string,
  desc: string,
  pos: ReservedWordDoc["pos"] = "command",
): ReservedWordDoc => ({
  name: mkProven("reserved_word", name),
  sig,
  desc,
  section: "Complex Commands",
  pos,
})

const param = (name: string, desc: string): ShellParamDoc => ({
  name: mkProven("shell_param", name),
  sig: name,
  desc,
  section: "Parameters Set By The Shell",
})

const cd = opt("AUTO_CD", "d:o")
const cu = unary("-a", "file", "d:u")
const cb = binary("-nt", "left", "right", "d:b")
const bi = builtin("echo", "echo [ -n ] [ arg ... ]", "d:bi")
const pc = precmd("noglob", "noglob command arg ...", "d:pc")
const rd = redir(">>", ">> word", "d:r")
const sub = ps("<(...)", "<(list)", "d:ps")
const word = rw("if", "if list then list fi", "d:rw")
const sec = param("SECONDS", "d:p")
const pflag = (flag: string, desc: string): ParamFlagDoc => ({
  flag: mkProven("param_flag", flag),
  args: [flag],
  sig: flag,
  desc,
  section: "Parameter Expansion",
})

const sflag = (flag: string, desc: string): SubscriptFlagDoc => ({
  flag: mkProven("subscript_flag", flag),
  args: [flag],
  sig: flag,
  desc,
  section: "Subscript Flags",
})

const hist = (
  key: string,
  kind: HistoryDoc["kind"],
  desc: string,
): HistoryDoc => ({
  key: mkProven("history", key),
  kind,
  sig: key,
  desc,
  section: "History Expansion",
})

const globOp = (op: string, desc: string): GlobOpDoc => ({
  op: mkProven("glob_op", op),
  sig: op,
  desc,
  section: "Filename Generation",
})

const globFlag = (flag: string, desc: string): GlobFlagDoc => ({
  flag: mkProven("glob_flag", flag),
  args: [flag],
  sig: flag,
  desc,
  section: "Filename Generation",
})

function mkCategoryMap<K extends DocCategory>(
  kind: K,
  docs: readonly DocRecordMap[K][],
): ReadonlyMap<string, DocRecordMap[K]> {
  const getId = docId[kind] as (doc: DocRecordMap[K]) => string
  return new Map(docs.map(doc => [getId(doc), doc]))
}

type DocArrays = { readonly [K in DocCategory]: readonly DocRecordMap[K][] }

function mkTestCorpus(overrides: Partial<DocArrays> = {}): DocCorpus {
  const base: DocArrays = {
    option: [cd],
    cond_op: [cu],
    builtin: [bi],
    precmd: [pc],
    shell_param: [sec],
    reserved_word: [word],
    redir: [rd],
    process_subst: [sub],
    subscript_flag: [sflag("(w)", "d:sf")],
    param_flag: [pflag("(U)", "d:pf")],
    history: [hist("!!", "event-designator", "d:h")],
    glob_op: [globOp("*", "d:g")],
    glob_flag: [globFlag("i", "d:gf")],
    ...overrides,
  }
  return Object.fromEntries(
    docCategories.map(k => [
      k,
      mkCategoryMap(k, base[k] as DocRecordMap[typeof k][]),
    ]),
  ) as unknown as DocCorpus
}

const corpus = (overrides: Partial<DocArrays> = {}) =>
  refDocs(mkTestCorpus(overrides))

const expectContainsAll = (
  text: string | undefined,
  parts: readonly string[],
) => {
  for (const part of parts) expect(text).toContain(part)
}

const headings = (text: string | undefined) =>
  (text?.match(/^## /gm) ?? []).length

const renderedMarkdownCases = [
  [
    "shell_param",
    mdShellParam(sec),
    ["`SECONDS`", "d:p", "_Category:_ Shell Parameter"],
  ],
  [
    "builtin",
    mdBuiltin(bi),
    ["`echo`", "```zsh", "echo [ -n ] [ arg ... ]", "d:bi"],
  ],
  ["precmd", mdPrecmd(pc), ["`noglob`", "_Role:_ precommand modifier"]],
  [
    "redir",
    mdRedir(rd),
    ["`>>`", "```zsh", ">> word", "d:r", "_Category:_ Redirection"],
  ],
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
  ["subscript_flag", mdSubscriptFlag(sflag("(w)", "d:sf")), ["TBD"]],
  ["param_flag", mdParamFlag(pflag("(U)", "d:pf")), ["TBD"]],
  ["history", mdHistory(hist("!!", "event-designator", "d:h")), ["TBD"]],
  ["glob_op", mdGlobOp(globOp("*", "d:g")), ["TBD"]],
  ["glob_flag", mdGlobFlag(globFlag("i", "d:gf")), ["TBD"]],
] as const

const dumpCases = [
  { file: "options.md", heading: "## AUTO_CD", snippet: "d:o" },
  { file: "cond-ops.md", heading: "## -nt", snippet: "d:b" },
  { file: "shell-params.md", heading: "## SECONDS", snippet: "`SECONDS`" },
  { file: "builtins.md", heading: "## echo", snippet: "d:bi" },
  { file: "precmds.md", heading: "## noglob", snippet: "d:pc" },
  { file: "redirs.md", heading: "## >> word", snippet: "d:r" },
  { file: "process-substs.md", heading: "## <(...)", snippet: "d:ps" },
  { file: "reserved-words.md", heading: "## if", snippet: "d:rw" },
  { file: "subscript-flags.md", heading: "## (w)", snippet: "TBD" },
  { file: "param-flags.md", heading: "## (U)", snippet: "TBD" },
  { file: "history.md", heading: "## !!", snippet: "TBD" },
  { file: "glob-ops.md", heading: "## *", snippet: "TBD" },
  { file: "glob-flags.md", heading: "## i", snippet: "TBD" },
] as const

describe("render markdown", () => {
  test("renders option markdown", () => {
    expectContainsAll(mdOpt(cd), [
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

  test("formats option refs in prose variants", () => {
    expect(
      fmtOptRefsInMd(
        "AUTO_CD AUTOCD NO_AUTO_CD NOAUTOCD",
        mkMdCtx([cd]).optNames,
      ),
    ).toBe("**`AUTO_CD`** **`AUTOCD`** **`NO_AUTO_CD`** **`NOAUTOCD`**")
  })

  test("skips vars and existing markdown code when formatting option refs", () => {
    expect(
      fmtOptRefsInMd(
        [
          "$AUTO_CD ${AUTO_CD} $NO_AUTO_CD ${NOAUTOCD}",
          "`AUTO_CD` AUTO_CD",
          "```zsh",
          "AUTO_CD",
          "```",
          "AUTOCD",
        ].join("\n"),
        mkMdCtx([cd]).optNames,
      ),
    ).toBe(
      [
        "$AUTO_CD ${AUTO_CD} $NO_AUTO_CD ${NOAUTOCD}",
        "`AUTO_CD` **`AUTO_CD`**",
        "```zsh",
        "AUTO_CD",
        "```",
        "**`AUTOCD`**",
      ].join("\n"),
    )
  })

  test("formats only known options", () => {
    expect(fmtOptRefsInMd("AUTO_CD CDPATH POSIX", mkMdCtx([cd]).optNames)).toBe(
      "**`AUTO_CD`** CDPATH POSIX",
    )
  })

  test("renders cond op markdown", () => {
    expect(mdCondOp(cu)).toBe("`-a` *file*\n\nd:u")
    expect(mdCondOp(cb)).toBe("*left* `-nt` *right*\n\nd:b")
  })

  test.each(renderedMarkdownCases)("renders %s markdown", (_, md, parts) => {
    expectContainsAll(md, parts)
  })

  test.each(stubMarkdownCases)("%s markdown is TBD", (_, md, parts) => {
    expectContainsAll(md, parts)
  })

  test("renders reserved-word with any position", () => {
    expect(
      mdReservedWord(rw("fi", "if list then list fi", "d:rw", "any")),
    ).toContain("_Role:_ reserved word (any position)")
  })

  test("derives default state by emulation", () => {
    expect(defaultStateIn(cd, "zsh")).toBe("on")
    expect(defaultStateIn({ ...cd, defaultIn: ["ksh"] }, "zsh")).toBe("off")
  })

  test("collects docs and sorts shell params", () => {
    expect(
      refDocs(
        mkTestCorpus({
          shell_param: [sec, param("argv", "d:a")],
          cond_op: [cu],
          redir: [],
          process_subst: [],
          reserved_word: [],
        }),
      ).map(doc => `${doc.kind}:${doc.id}`),
    ).toEqual([
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

  test("keeps typed ref-doc ids separate from display headings", () => {
    const docs = corpus()
    const option = docs.find(doc => doc.kind === "option")
    expect(option?.id).toBe(mkProven("option", "AUTO_CD"))
    expect(option?.heading).toBe("AUTO_CD")
    expect(docs.find(doc => doc.kind === "redir")?.heading).toBe(">> word")
  })
})

describe("render dump", () => {
  test("renders per-kind dump files", () => {
    const files = dumpText(corpus({ cond_op: [cb] }))

    for (const { file, heading } of dumpCases) {
      expect(files.get(file)).toContain(heading)
      expect(files.get("all.md")).toContain(heading)
    }

    expect(files.get("suspicious.md")).toBe("")
  })

  test("writes dump files", async () => {
    await withTmpDirAsync("better-zsh-ref-", async dir => {
      await writeRefDump(dir, corpus({ cond_op: [cb] }))

      const all = readFileSync(join(dir, "all.md"), "utf8")
      for (const { file, heading, snippet } of dumpCases) {
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

    const categoryFiles: Record<DocCategory, RefDumpFile> = {
      option: "options.md",
      cond_op: "cond-ops.md",
      builtin: "builtins.md",
      precmd: "precmds.md",
      shell_param: "shell-params.md",
      reserved_word: "reserved-words.md",
      redir: "redirs.md",
      process_subst: "process-substs.md",
      subscript_flag: "subscript-flags.md",
      param_flag: "param-flags.md",
      history: "history.md",
      glob_op: "glob-ops.md",
      glob_flag: "glob-flags.md",
    }

    for (const kind of docCategories) {
      const file = categoryFiles[kind]
      const src = [...vendored[kind].values()]
      test(`${file} covers ${kind}`, () => {
        expect(docs.filter(doc => doc.kind === kind)).toHaveLength(src.length)
        expect(headings(files.get(file))).toBe(src.length)
      })
    }

    test("emitted markdown strips raw yodl markers", () => {
      for (const file of [
        "options.md",
        "cond-ops.md",
        "shell-params.md",
        "builtins.md",
        "precmds.md",
        "redirs.md",
        "process-substs.md",
        "reserved-words.md",
      ] as const) {
        expect(files.get(file)).not.toContain("tt(")
        expect(files.get(file)).not.toContain("var(")
      }
    })

    test("emitted markdown avoids known suspicious patterns", () => {
      for (const [file, pattern] of [
        ["options.md", "See ."],
        ["options.md", "See \\ ."],
        ["cond-ops.md", "See ."],
      ] as const) {
        expect(files.get(file)).not.toContain(pattern)
      }
      expect(files.get("suspicious.md")).toBe("")
    })

    test("formats real option cross-references but not env vars", () => {
      const options = [...vendored.option.values()]
      const byName = new Map(options.map(option => [option.name, option]))
      const cdSilent = byName.get(mkProven("option", "CD_SILENT"))
      expect(cdSilent).toBeTruthy()

      const md = mdOpt(
        // biome-ignore lint/style/noNonNullAssertion: asserted above
        cdSilent!,
        mkMdCtx(options),
      )
      expect(md).toContain("**`AUTO_CD`**")
      expect(md).toContain("**`PUSHD_SILENT`**")
      expect(md).toContain("**`POSIX_CD`**")
      expect(md).not.toContain("`CDPATH`")
    })
  })
})
