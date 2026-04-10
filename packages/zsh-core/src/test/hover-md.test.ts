import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { hoverDocs } from "../hover-docs"
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

describe("hover markdown", () => {
  test("renders option markdown", () => {
    expect(mdOpt(opt)).toContain("`AUTO_CD`")
    expect(mdOpt(opt)).toContain("```zsh")
    expect(mdOpt(opt)).toContain("setopt auto_cd")
    expect(mdOpt(opt)).toContain("unsetopt auto_cd")
    expect(mdOpt(opt)).toContain("set -J")
    expect(mdOpt(opt)).toContain("set +J")
    expect(mdOpt(opt)).toContain("**Default in zsh: `on`**")
    expect(mdOpt(opt)).toContain("_Option category:_ Changing Directories")
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

  test("renders param markdown", () => {
    expect(mdParam(param)).toContain("`SECONDS`")
    expect(mdParam(param)).toContain(
      "The number of seconds since shell invocation.",
    )
    expect(mdParam(param)).toContain("_Category:_ Shell Parameter")
  })

  test("renders builtin markdown", () => {
    expect(mdBuiltin(builtin)).toContain("`echo`")
    expect(mdBuiltin(builtin)).toContain("```zsh")
    expect(mdBuiltin(builtin)).toContain("echo [ -n ] [ arg ... ]")
    expect(mdBuiltin(builtin)).toContain("Write text.")
  })

  test("renders precommand modifier markdown", () => {
    expect(mdPrecmd(precmd)).toContain("`noglob`")
    expect(mdPrecmd(precmd)).toContain("_Role:_ precommand modifier")
  })

  test("renders redirection markdown", () => {
    const md = mdRedir(redir)
    expect(md).toContain("`>>`")
    expect(md).toContain("```zsh")
    expect(md).toContain(">> word")
    expect(md).toContain("Append output to word.")
    expect(md).toContain("_Category:_ Redirection")
  })

  test("renders process-substitution markdown", () => {
    const md = mdProcessSubst(processSubst)
    expect(md).toContain("`<(...)`")
    expect(md).toContain("Replace with a file descriptor")
    expect(md).toContain("_Category:_ Process Substitution")
  })

  test("renders reserved-word markdown", () => {
    const md = mdReservedWord(reservedWord)
    expect(md).toContain("`if`")
    expect(md).toContain("Execute list conditionally.")
    expect(md).toContain("_Role:_ reserved word (command position)")
  })

  test("renders reserved-word with any position", () => {
    const rw: ReservedWordDoc = {
      ...reservedWord,
      name: "fi",
      pos: "any",
    }
    expect(mdReservedWord(rw)).toContain("_Role:_ reserved word (any position)")
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
      options: [opt],
      condOps: [unary],
      params: [
        param,
        {
          name: "argv",
          sig: "argv",
          desc: "An array containing the positional parameters.",
          section: "Parameters Set By The Shell",
        },
      ],
      builtins: [builtin],
      precmds: [precmd],
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
    const docs = hoverDocs({
      options: [opt],
      condOps: [binary],
      params: [param],
      builtins: [builtin],
      precmds: [precmd],
    })
    const files = dumpText(docs)
    expect(files.get("options.md")).toContain("## AUTO_CD")
    expect(files.get("cond-ops.md")).toContain("## -nt")
    expect(files.get("params.md")).toContain("## SECONDS")
    expect(files.get("builtins.md")).toContain("## echo")
    expect(files.get("precmds.md")).toContain("## noglob")
    expect(files.get("suspicious.md")).toBe("")
    expect(files.get("all.md")).toContain("## AUTO_CD")
    expect(files.get("all.md")).toContain("## -nt")
    expect(files.get("all.md")).toContain("## SECONDS")
    expect(files.get("all.md")).toContain("## echo")
    expect(files.get("all.md")).toContain("## noglob")
  })

  test("writes dump files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "better-zsh-hover-"))
    try {
      await writeHoverDump(
        dir,
        hoverDocs({
          options: [opt],
          condOps: [binary],
          params: [param],
          builtins: [builtin],
          precmds: [precmd],
        }),
      )
      expect(readFileSync(join(dir, "all.md"), "utf8")).toContain("## AUTO_CD")
      expect(readFileSync(join(dir, "options.md"), "utf8")).toContain("Desc.")
      expect(readFileSync(join(dir, "cond-ops.md"), "utf8")).toContain(
        "Newer than.",
      )
      expect(readFileSync(join(dir, "params.md"), "utf8")).toContain(
        "`SECONDS`",
      )
      expect(readFileSync(join(dir, "builtins.md"), "utf8")).toContain(
        "Write text.",
      )
      expect(readFileSync(join(dir, "precmds.md"), "utf8")).toContain(
        "Disable filename generation.",
      )
      expect(readFileSync(join(dir, "suspicious.md"), "utf8")).toBe("")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  describe("vendored docs", () => {
    const options = getOptions()
    const builtins = getBuiltins()
    const condOps = getCondOps()
    const precmds = getPrecmds()
    const params = getShellParams()
    const docs = hoverDocs({
      options,
      condOps,
      params,
      builtins,
      precmds,
    })
    const files = dumpText(docs)

    test("covers all vendored options and cond ops", () => {
      expect(docs.filter((doc) => doc.kind === "option")).toHaveLength(
        options.length,
      )
      expect(docs.filter((doc) => doc.kind === "cond-op")).toHaveLength(
        condOps.length,
      )
      expect(docs.filter((doc) => doc.kind === "param")).toHaveLength(
        params.length,
      )
      expect(docs.filter((doc) => doc.kind === "builtin")).toHaveLength(
        builtins.length,
      )
      expect(docs.filter((doc) => doc.kind === "precmd")).toHaveLength(
        precmds.length,
      )
      expect((files.get("options.md")?.match(/^## /gm) ?? []).length).toBe(
        options.length,
      )
      expect((files.get("cond-ops.md")?.match(/^## /gm) ?? []).length).toBe(
        condOps.length,
      )
      expect((files.get("params.md")?.match(/^## /gm) ?? []).length).toBe(
        params.length,
      )
      expect((files.get("builtins.md")?.match(/^## /gm) ?? []).length).toBe(
        builtins.length,
      )
      expect((files.get("precmds.md")?.match(/^## /gm) ?? []).length).toBe(
        precmds.length,
      )
    })

    test("emitted markdown strips raw yodl markers", () => {
      expect(files.get("options.md")).not.toContain("tt(")
      expect(files.get("options.md")).not.toContain("var(")
      expect(files.get("cond-ops.md")).not.toContain("tt(")
      expect(files.get("cond-ops.md")).not.toContain("var(")
      expect(files.get("builtins.md")).not.toContain("tt(")
      expect(files.get("builtins.md")).not.toContain("var(")
      expect(files.get("precmds.md")).not.toContain("tt(")
      expect(files.get("precmds.md")).not.toContain("var(")
    })

    test("emitted markdown avoids known suspicious patterns", () => {
      expect(files.get("options.md")).not.toContain("See .")
      expect(files.get("options.md")).not.toContain("See \\ .")
      expect(files.get("cond-ops.md")).not.toContain("See .")
      expect(files.get("suspicious.md")).toBe("")
    })

    test("formats real option cross-references but not env vars", () => {
      const byName = new Map(options.map((o) => [o.name, o]))
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
