import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { dumpText, writeRefDump } from "../../render/dump"
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
  mdRegressions,
  mdReservedWord,
  mdShellParam,
  mdSubscriptFlag,
  mkMdCtx,
} from "../../render/md"
import { type RefDocArgs, refDocs } from "../../render/refs"
import {
  mkBuiltinName,
  mkCondOp,
  mkGlobbingFlag,
  mkGlobOp,
  mkHistoryKey,
  mkOptFlagChar,
  mkOptName,
  mkParamFlag,
  mkRedirOp,
  mkRedirSig,
  mkReservedWord,
  mkShellParamName,
  mkSubscriptFlag,
} from "../../types/brand"
import type {
  BuiltinDoc,
  CondOpDoc,
  GlobbingFlagDoc,
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
} from "../../types/zsh-data"
import * as zd from "../../zsh-data"
import { withTmpDirAsync } from "../tmp-dir"

const opt = (name: string, desc: string): ZshOption => ({
  name: mkOptName(name),
  display: name,
  flags: [{ char: mkOptFlagChar("J"), on: "-" }],
  defaultIn: ["csh", "ksh", "sh", "zsh"],
  category: "Changing Directories",
  desc,
})

const unary = (op: string, operand: string, desc: string): CondOpDoc => ({
  op: mkCondOp(op),
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
  op: mkCondOp(op),
  operands: [left, right],
  desc,
  arity: "binary",
})

const builtin = (name: string, synopsis: string, desc: string): BuiltinDoc => ({
  name: mkBuiltinName(name),
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
  sig: mkRedirSig(sig),
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
  name: mkReservedWord(name),
  sig,
  desc,
  section: "Complex Commands",
  pos,
})

const param = (name: string, desc: string): ShellParamDoc => ({
  name: mkShellParamName(name),
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
  flag: mkParamFlag(flag),
  args: [flag],
  sig: flag,
  desc,
  section: "Parameter Expansion",
})

const sflag = (flag: string, desc: string): SubscriptFlagDoc => ({
  flag: mkSubscriptFlag(flag),
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
  key: mkHistoryKey(key),
  kind,
  sig: key,
  desc,
  section: "History Expansion",
})

const globOp = (op: string, desc: string): GlobOpDoc => ({
  op: mkGlobOp(op),
  sig: op,
  desc,
  section: "Filename Generation",
})

const globFlag = (flag: string, desc: string): GlobbingFlagDoc => ({
  flag: mkGlobbingFlag(flag),
  args: [flag],
  sig: flag,
  desc,
  section: "Filename Generation",
})

function args(overrides: Partial<RefDocArgs> = {}): RefDocArgs {
  return {
    options: [cd],
    condOps: [cu],
    shellParams: [sec],
    builtins: [bi],
    precmds: [pc],
    redirs: [rd],
    processSubsts: [sub],
    reservedWords: [word],
    subscriptFlags: [sflag("(w)", "d:sf")],
    paramFlags: [pflag("(U)", "d:pf")],
    history: [hist("!!", "event-designator", "d:h")],
    globOps: [globOp("*", "d:g")],
    globFlags: [globFlag("i", "d:gf")],
    ...overrides,
  }
}

const corpus = (overrides: Partial<RefDocArgs> = {}) => refDocs(args(overrides))

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
    "shell-param",
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
    "process-subst",
    mdProcessSubst(sub),
    ["`<(...)`", "d:ps", "_Category:_ Process Substitution"],
  ],
  [
    "reserved-word",
    mdReservedWord(word),
    ["`if`", "d:rw", "_Role:_ reserved word (command position)"],
  ],
] as const

const stubMarkdownCases = [
  ["subscript-flag", mdSubscriptFlag(sflag("(w)", "d:sf")), ["TBD"]],
  ["param-flag", mdParamFlag(pflag("(U)", "d:pf")), ["TBD"]],
  ["history", mdHistory(hist("!!", "event-designator", "d:h")), ["TBD"]],
  ["glob-op", mdGlobOp(globOp("*", "d:g")), ["TBD"]],
  ["glob-flag", mdGlobFlag(globFlag("i", "d:gf")), ["TBD"]],
] as const

const dumpCases = [
  { file: "options.md", heading: "## AUTO_CD", snippet: "d:o" },
  { file: "cond-ops.md", heading: "## -nt", snippet: "d:b" },
  {
    file: "shell-params.md",
    heading: "## SECONDS",
    snippet: "`SECONDS`",
  },
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
      refDocs({
        ...args(),
        shellParams: [sec, param("argv", "d:a")],
        condOps: [cu],
        redirs: [],
        processSubsts: [],
        reservedWords: [],
      }).map((doc) => `${doc.kind}:${doc.id}`),
    ).toEqual([
      `option:${mkOptName("AUTO_CD")}`,
      "cond-op:-a",
      "shell-param:argv",
      "shell-param:SECONDS",
      "builtin:echo",
      "precmd:noglob",
      "subscript-flag:(w)",
      "param-flag:(U)",
      "history:!!",
      "glob-op:*",
      "glob-flag:i",
    ])
  })

  test("keeps typed ref-doc ids separate from display headings", () => {
    const docs = corpus()
    const option = docs.find((doc) => doc.kind === "option")
    expect(option?.id).toBe(mkOptName("AUTO_CD"))
    expect(option?.heading).toBe("AUTO_CD")
    expect(docs.find((doc) => doc.kind === "redir")?.heading).toBe(">> word")
  })

  test("regression registry is easy to find", () => {
    expect(mdRegressions).toEqual([])
  })
})

describe("render dump", () => {
  test("renders per-kind dump files", () => {
    const files = dumpText(corpus({ condOps: [cb] }))

    for (const { file, heading } of dumpCases) {
      expect(files.get(file)).toContain(heading)
      expect(files.get("all.md")).toContain(heading)
    }

    expect(files.get("suspicious.md")).toBe("")
  })

  test("writes dump files", async () => {
    await withTmpDirAsync("better-zsh-ref-", async (dir) => {
      await writeRefDump(dir, corpus({ condOps: [cb] }))

      const all = readFileSync(join(dir, "all.md"), "utf8")
      for (const { file, heading, snippet } of dumpCases) {
        expect(all).toContain(heading)
        expect(readFileSync(join(dir, file), "utf8")).toContain(snippet)
      }
      expect(readFileSync(join(dir, "suspicious.md"), "utf8")).toBe("")
    })
  })

  describe("vendored docs", () => {
    const options = zd.getOptions()
    const condOps = zd.getCondOps()
    const shellParams = zd.getShellParams()
    const builtins = zd.getBuiltins()
    const precmds = zd.getPrecmds()
    const redirs = zd.getRedirections()
    const processSubsts = zd.getProcessSubsts()
    const reservedWords = zd.getReservedWords()
    const subscriptFlags = zd.getSubscriptFlags()
    const paramFlags = zd.getParamFlags()
    const history = zd.getHistoryDocs()
    const globOps = zd.getGlobOps()
    const globFlags = zd.getGlobbingFlags()
    const docs = refDocs({
      options,
      condOps,
      shellParams,
      builtins,
      precmds,
      redirs,
      processSubsts,
      reservedWords,
      subscriptFlags,
      paramFlags,
      history,
      globOps,
      globFlags,
    })
    const files = dumpText(docs)

    for (const { kind, file, src } of [
      { kind: "option", file: "options.md", src: options },
      { kind: "cond-op", file: "cond-ops.md", src: condOps },
      { kind: "shell-param", file: "shell-params.md", src: shellParams },
      { kind: "builtin", file: "builtins.md", src: builtins },
      { kind: "precmd", file: "precmds.md", src: precmds },
      { kind: "redir", file: "redirs.md", src: redirs },
      { kind: "process-subst", file: "process-substs.md", src: processSubsts },
      { kind: "reserved-word", file: "reserved-words.md", src: reservedWords },
      {
        kind: "subscript-flag",
        file: "subscript-flags.md",
        src: subscriptFlags,
      },
      { kind: "param-flag", file: "param-flags.md", src: paramFlags },
      { kind: "history", file: "history.md", src: history },
      { kind: "glob-op", file: "glob-ops.md", src: globOps },
      { kind: "glob-flag", file: "glob-flags.md", src: globFlags },
    ] as const) {
      test(`${file} covers ${kind}`, () => {
        expect(docs.filter((doc) => doc.kind === kind)).toHaveLength(src.length)
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
      const byName = new Map(options.map((option) => [option.name, option]))
      const cdSilent = byName.get(mkOptName("CD_SILENT"))
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
