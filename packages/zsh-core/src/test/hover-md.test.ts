import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { type HoverDocArgs, hoverDocs } from "../hover-docs"
import { dumpText, writeHoverDump } from "../hover-dump"
import {
  defaultStateIn,
  fmtOptRefsInMd,
  hoverMdRegressions,
  mdBuiltin,
  mdCond,
  mdOpt,
  mdParam,
  mdPrecmd,
  mdProcessSubst,
  mdRedir,
  mdReservedWord,
  mkHoverMdCtx,
} from "../hover-md"
import {
  mkBuiltinName,
  mkCondOp,
  mkOptFlagChar,
  mkOptName,
  mkRedirOp,
  mkRedirSig,
  mkReservedWord,
  mkShellParamName,
} from "../types/brand"
import type {
  BuiltinDoc,
  CondOpDoc,
  PrecmdDoc,
  ProcessSubstDoc,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  ZshOption,
} from "../types/zsh-data"
import * as zd from "../zsh-data"
import { withTmpDirAsync } from "./tmp-dir"

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

function args(overrides: Partial<HoverDocArgs> = {}): HoverDocArgs {
  return {
    options: [cd],
    condOps: [cu],
    params: [sec],
    builtins: [bi],
    precmds: [pc],
    redirs: [rd],
    processSubsts: [sub],
    reservedWords: [word],
    ...overrides,
  }
}

const corpus = (overrides: Partial<HoverDocArgs> = {}) =>
  hoverDocs(args(overrides))

const has = (text: string | undefined, parts: readonly string[]) => {
  for (const part of parts) expect(text).toContain(part)
}

const headings = (text: string | undefined) =>
  (text?.match(/^## /gm) ?? []).length

describe("hover markdown", () => {
  test("renders option markdown", () => {
    has(mdOpt(cd), [
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
        mkHoverMdCtx([cd]).optNames,
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
        mkHoverMdCtx([cd]).optNames,
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
    expect(
      fmtOptRefsInMd("AUTO_CD CDPATH POSIX", mkHoverMdCtx([cd]).optNames),
    ).toBe("**`AUTO_CD`** CDPATH POSIX")
  })

  test("renders cond op markdown", () => {
    expect(mdCond(cu)).toBe("`-a` *file*\n\nd:u")
    expect(mdCond(cb)).toBe("*left* `-nt` *right*\n\nd:b")
  })

  for (const [name, md, parts] of [
    [
      "param",
      mdParam(sec),
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
  ] as const) {
    test(name, () => has(md, parts))
  }

  test("renders reserved-word with any position", () => {
    expect(
      mdReservedWord(rw("fi", "if list then list fi", "d:rw", "any")),
    ).toContain("_Role:_ reserved word (any position)")
  })

  test("derives default state by emulation", () => {
    expect(defaultStateIn(cd, "zsh")).toBe("on")
    expect(defaultStateIn({ ...cd, defaultIn: ["ksh"] }, "zsh")).toBe("off")
  })

  test("collects docs and sorts params", () => {
    expect(
      hoverDocs({
        ...args(),
        params: [sec, param("argv", "d:a")],
        condOps: [cu],
        redirs: [],
        processSubsts: [],
        reservedWords: [],
      }).map((doc) => `${doc.kind}:${doc.id}`),
    ).toEqual([
      `option:${mkOptName("AUTO_CD")}`,
      "cond-op:-a",
      "param:argv",
      "param:SECONDS",
      "builtin:echo",
      "precmd:noglob",
    ])
  })

  test("keeps typed hover-doc ids separate from display headings", () => {
    const docs = corpus()
    const option = docs.find((doc) => doc.kind === "option")
    expect(option?.id).toBe(mkOptName("AUTO_CD"))
    expect(option?.heading).toBe("AUTO_CD")
    expect(docs.find((doc) => doc.kind === "redir")?.heading).toBe(">> word")
  })

  test("regression registry is easy to find", () => {
    expect(hoverMdRegressions).toEqual([])
  })
})

describe("hover dump", () => {
  test("renders per-kind dump files", () => {
    const files = dumpText(corpus({ condOps: [cb] }))

    for (const [file, heading] of [
      ["options.md", "## AUTO_CD"],
      ["cond-ops.md", "## -nt"],
      ["params.md", "## SECONDS"],
      ["builtins.md", "## echo"],
      ["precmds.md", "## noglob"],
      ["redirs.md", "## >> word"],
      ["process-substs.md", "## <(...)"],
      ["reserved-words.md", "## if"],
    ] as const) {
      expect(files.get(file)).toContain(heading)
      expect(files.get("all.md")).toContain(heading)
    }

    expect(files.get("suspicious.md")).toBe("")
  })

  test("writes dump files", async () => {
    await withTmpDirAsync("better-zsh-hover-", async (dir) => {
      await writeHoverDump(dir, corpus({ condOps: [cb] }))

      for (const [file, snippet] of [
        ["all.md", "## AUTO_CD"],
        ["options.md", "d:o"],
        ["cond-ops.md", "d:b"],
        ["params.md", "`SECONDS`"],
        ["builtins.md", "d:bi"],
        ["precmds.md", "d:pc"],
        ["redirs.md", "d:r"],
        ["process-substs.md", "d:ps"],
        ["reserved-words.md", "d:rw"],
      ] as const) {
        expect(readFileSync(join(dir, file), "utf8")).toContain(snippet)
      }
      expect(readFileSync(join(dir, "suspicious.md"), "utf8")).toBe("")
    })
  })

  describe("vendored docs", () => {
    const options = zd.getOptions()
    const condOps = zd.getCondOps()
    const params = zd.getShellParams()
    const builtins = zd.getBuiltins()
    const precmds = zd.getPrecmds()
    const redirs = zd.getRedirections()
    const processSubsts = zd.getProcessSubsts()
    const reservedWords = zd.getReservedWords()
    const docs = hoverDocs({
      options,
      condOps,
      params,
      builtins,
      precmds,
      redirs,
      processSubsts,
      reservedWords,
    })
    const files = dumpText(docs)

    for (const { kind, file, src } of [
      { kind: "option", file: "options.md", src: options },
      { kind: "cond-op", file: "cond-ops.md", src: condOps },
      { kind: "param", file: "params.md", src: params },
      { kind: "builtin", file: "builtins.md", src: builtins },
      { kind: "precmd", file: "precmds.md", src: precmds },
      { kind: "redir", file: "redirs.md", src: redirs },
      { kind: "process-subst", file: "process-substs.md", src: processSubsts },
      { kind: "reserved-word", file: "reserved-words.md", src: reservedWords },
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
        mkHoverMdCtx(options),
      )
      expect(md).toContain("**`AUTO_CD`**")
      expect(md).toContain("**`PUSHD_SILENT`**")
      expect(md).toContain("**`POSIX_CD`**")
      expect(md).not.toContain("`CDPATH`")
    })
  })
})
