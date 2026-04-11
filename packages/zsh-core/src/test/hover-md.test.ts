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
import {
  getBuiltins,
  getCondOps,
  getOptions,
  getPrecmds,
  getShellParams,
} from "../zsh-data"
import { withTmpDirAsync } from "./tmp-dir"

const opt: ZshOption = {
  name: mkOptName("AUTO_CD"),
  display: "AUTO_CD",
  flags: [{ char: mkOptFlagChar("J"), on: "-" }],
  defaultIn: ["csh", "ksh", "sh", "zsh"],
  category: "Changing Directories",
  desc: "Desc.",
}

const unary: CondOpDoc = {
  op: mkCondOp("-a"),
  operands: ["file"],
  desc: "Exists.",
  kind: "unary",
}

const binary: CondOpDoc = {
  op: mkCondOp("-nt"),
  operands: ["left", "right"],
  desc: "Newer than.",
  kind: "binary",
}

const builtin: BuiltinDoc = {
  name: mkBuiltinName("echo"),
  synopsis: ["echo [ -n ] [ arg ... ]"],
  desc: "Write text.",
}

const precmd: PrecmdDoc = {
  name: "noglob",
  synopsis: ["noglob command arg ..."],
  desc: "Disable filename generation.",
}

const redir: RedirDoc = {
  op: ">>",
  sig: ">> word",
  desc: "Append output to word.",
  section: "Redirections",
}

const processSubst: ProcessSubstDoc = {
  op: "<(...)",
  sig: "<(list)",
  desc: "Replace with a file descriptor for the output of list.",
  section: "Process Substitution",
}

const reservedWord: ReservedWordDoc = {
  name: "if",
  sig: "if list then list fi",
  desc: "Execute list conditionally.",
  section: "Complex Commands",
  pos: "command",
}

const param: ShellParamDoc = {
  name: "SECONDS",
  sig: "SECONDS",
  desc: "The number of seconds since shell invocation.",
  section: "Parameters Set By The Shell",
}

function sampleHoverArgs(overrides: Partial<HoverDocArgs> = {}): HoverDocArgs {
  return {
    options: [opt],
    condOps: [unary],
    params: [param],
    builtins: [builtin],
    precmds: [precmd],
    redirs: [redir],
    processSubsts: [processSubst],
    reservedWords: [reservedWord],
    ...overrides,
  }
}

function sampleCorpus(overrides: Partial<HoverDocArgs> = {}) {
  return hoverDocs(sampleHoverArgs(overrides))
}

function headingCount(text: string | undefined): number {
  return (text?.match(/^## /gm) ?? []).length
}

describe("hover markdown", () => {
  test("renders option markdown", () => {
    const md = mdOpt(opt)
    expect(md).toContain("`AUTO_CD`")
    expect(md).toContain("```zsh")
    expect(md).toContain("setopt auto_cd")
    expect(md).toContain("unsetopt auto_cd")
    expect(md).toContain("set -J")
    expect(md).toContain("set +J")
    expect(md).toContain("**Default in zsh: `on`**")
    expect(md).toContain("_Option category:_ Changing Directories")
  })

  test("formats option refs in prose variants", () => {
    const ctx = mkHoverMdCtx([opt])
    expect(
      fmtOptRefsInMd("AUTO_CD AUTOCD NO_AUTO_CD NOAUTOCD", ctx.optNames),
    ).toBe("**`AUTO_CD`** **`AUTOCD`** **`NO_AUTO_CD`** **`NOAUTOCD`**")
  })

  test("skips vars and existing markdown code when formatting option refs", () => {
    const ctx = mkHoverMdCtx([opt])
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
        ctx.optNames,
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
    const ctx = mkHoverMdCtx([opt])
    expect(fmtOptRefsInMd("AUTO_CD CDPATH POSIX", ctx.optNames)).toBe(
      "**`AUTO_CD`** CDPATH POSIX",
    )
  })

  test("renders cond op markdown", () => {
    expect(mdCond(unary)).toBe("`-a` *file*\n\nExists.")
    expect(mdCond(binary)).toBe("*left* `-nt` *right*\n\nNewer than.")
  })

  const renderCases: [string, string, readonly string[]][] = [
    [
      "renders param markdown",
      mdParam(param),
      [
        "`SECONDS`",
        "The number of seconds since shell invocation.",
        "_Category:_ Shell Parameter",
      ],
    ],
    [
      "renders builtin markdown",
      mdBuiltin(builtin),
      ["`echo`", "```zsh", "echo [ -n ] [ arg ... ]", "Write text."],
    ],
    [
      "renders precommand modifier markdown",
      mdPrecmd(precmd),
      ["`noglob`", "_Role:_ precommand modifier"],
    ],
    [
      "renders redirection markdown",
      mdRedir(redir),
      [
        "`>>`",
        "```zsh",
        ">> word",
        "Append output to word.",
        "_Category:_ Redirection",
      ],
    ],
    [
      "renders process-substitution markdown",
      mdProcessSubst(processSubst),
      [
        "`<(...)`",
        "Replace with a file descriptor",
        "_Category:_ Process Substitution",
      ],
    ],
    [
      "renders reserved-word markdown",
      mdReservedWord(reservedWord),
      [
        "`if`",
        "Execute list conditionally.",
        "_Role:_ reserved word (command position)",
      ],
    ],
  ]

  for (const [name, md, parts] of renderCases) {
    test(name, () => {
      for (const part of parts) expect(md).toContain(part)
    })
  }

  test("renders reserved-word with any position", () => {
    expect(
      mdReservedWord({
        ...reservedWord,
        name: "fi",
        pos: "any",
      }),
    ).toContain("_Role:_ reserved word (any position)")
  })

  test("derives default state by emulation", () => {
    expect(defaultStateIn(opt, "zsh")).toBe("on")
    expect(
      defaultStateIn(
        {
          ...opt,
          defaultIn: ["ksh"],
        },
        "zsh",
      ),
    ).toBe("off")
  })

  test("collects docs and sorts params", () => {
    const docs = hoverDocs({
      ...sampleHoverArgs(),
      params: [
        param,
        {
          name: "argv",
          sig: "argv",
          desc: "An array containing the positional parameters.",
          section: "Parameters Set By The Shell",
        },
      ],
      condOps: [unary],
      redirs: [],
      processSubsts: [],
      reservedWords: [],
    })

    expect(docs.map((doc) => `${doc.kind}:${doc.key}`)).toEqual([
      "option:AUTO_CD",
      "cond-op:-a",
      "param:argv",
      "param:SECONDS",
      "builtin:echo",
      "precmd:noglob",
    ])
  })

  test("regression registry is easy to find", () => {
    expect(hoverMdRegressions).toEqual([])
  })
})

describe("hover dump", () => {
  test("renders per-kind dump files", () => {
    const files = dumpText(sampleCorpus({ condOps: [binary] }))

    for (const [file, heading] of [
      ["options.md", "## AUTO_CD"],
      ["cond-ops.md", "## -nt"],
      ["params.md", "## SECONDS"],
      ["builtins.md", "## echo"],
      ["precmds.md", "## noglob"],
      ["redirs.md", "## >>"],
      ["process-substs.md", "## <(...)"],
      ["reserved-words.md", "## if"],
    ] as const) {
      expect(files.get(file)).toContain(heading)
    }

    expect(files.get("suspicious.md")).toBe("")
    for (const heading of [
      "## AUTO_CD",
      "## -nt",
      "## SECONDS",
      "## echo",
      "## noglob",
      "## >>",
      "## <(...)",
      "## if",
    ]) {
      expect(files.get("all.md")).toContain(heading)
    }
  })

  test("writes dump files", async () => {
    await withTmpDirAsync("better-zsh-hover-", async (dir) => {
      await writeHoverDump(dir, sampleCorpus({ condOps: [binary] }))

      for (const [file, snippet] of [
        ["all.md", "## AUTO_CD"],
        ["options.md", "Desc."],
        ["cond-ops.md", "Newer than."],
        ["params.md", "`SECONDS`"],
        ["builtins.md", "Write text."],
        ["precmds.md", "Disable filename generation."],
        ["redirs.md", "Append output to word."],
        ["process-substs.md", "Replace with a file descriptor"],
        ["reserved-words.md", "Execute list conditionally."],
      ] as const) {
        expect(readFileSync(join(dir, file), "utf8")).toContain(snippet)
      }
      expect(readFileSync(join(dir, "suspicious.md"), "utf8")).toBe("")
    })
  })

  describe("vendored docs", () => {
    const options = getOptions()
    const condOps = getCondOps()
    const params = getShellParams()
    const builtins = getBuiltins()
    const precmds = getPrecmds()
    const corpus = hoverDocs({
      options,
      condOps,
      params,
      builtins,
      precmds,
    })
    const files = dumpText(corpus)
    const vendoredKinds = [
      { kind: "option", file: "options.md", docs: options },
      { kind: "cond-op", file: "cond-ops.md", docs: condOps },
      { kind: "param", file: "params.md", docs: params },
      { kind: "builtin", file: "builtins.md", docs: builtins },
      { kind: "precmd", file: "precmds.md", docs: precmds },
    ] as const

    test("covers vendored corpus by kind and dump file", () => {
      for (const { kind, file, docs } of vendoredKinds) {
        expect(corpus.filter((doc) => doc.kind === kind)).toHaveLength(
          docs.length,
        )
        expect(headingCount(files.get(file))).toBe(docs.length)
      }
    })

    test("emitted markdown strips raw yodl markers", () => {
      for (const file of [
        "options.md",
        "cond-ops.md",
        "builtins.md",
        "precmds.md",
      ] as const) {
        const text = files.get(file) ?? ""
        expect(text).not.toContain("tt(")
        expect(text).not.toContain("var(")
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
