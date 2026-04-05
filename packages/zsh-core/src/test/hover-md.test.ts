import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { dumpText, writeHoverDump } from "../hover-dump"
import {
  defaultStateIn,
  fmtOptRefsInMd,
  hoverDocs,
  hoverMdRegressions,
  mdCond,
  mdOpt,
  mdParam,
  mkHoverMdCtx,
} from "../hover-md"
import { mkCondOp, mkOptFlagChar, mkOptName } from "../types/brand"
import type { CondOperator, ZshOption } from "../types/zsh-data"
import { getCondOps, getOptions } from "../zsh-data"

const opt: ZshOption = {
  name: mkOptName("AUTO_CD"),
  display: "AUTO_CD",
  flags: [{ char: mkOptFlagChar("J"), on: "-" }],
  defaultIn: ["csh", "ksh", "sh", "zsh"],
  category: "Changing Directories",
  desc: "Desc.",
}

const unary: CondOperator = {
  op: mkCondOp("-a"),
  operands: ["file"],
  desc: "Exists.",
  kind: "unary",
}

const binary: CondOperator = {
  op: mkCondOp("-nt"),
  operands: ["left", "right"],
  desc: "Newer than.",
  kind: "binary",
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
    expect(mdParam("SECONDS", "integer-special-readonly-export")).toBe(
      "`SECONDS`: integer (readonly, exported) — zsh special parameter",
    )
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
      params: new Map([
        ["SECONDS", "integer-special-readonly"],
        ["argv", "array-special"],
      ]),
    })
    expect(docs.map((doc) => `${doc.kind}:${doc.key}`)).toEqual([
      "option:AUTO_CD",
      "cond-op:-a",
      "param:argv",
      "param:SECONDS",
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
      params: new Map([["SECONDS", "integer-special-readonly"]]),
    })
    const files = dumpText(docs)
    expect(files.get("options.md")).toContain("## AUTO_CD")
    expect(files.get("cond-ops.md")).toContain("## -nt")
    expect(files.get("params.md")).toContain("## SECONDS")
    expect(files.get("suspicious.md")).toBe("")
    expect(files.get("all.md")).toContain("## AUTO_CD")
    expect(files.get("all.md")).toContain("## -nt")
    expect(files.get("all.md")).toContain("## SECONDS")
  })

  test("writes dump files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "better-zsh-hover-"))
    try {
      await writeHoverDump(
        dir,
        hoverDocs({
          options: [opt],
          condOps: [binary],
          params: new Map([["SECONDS", "integer-special-readonly"]]),
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
      expect(readFileSync(join(dir, "suspicious.md"), "utf8")).toBe("")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  describe("vendored docs", () => {
    const options = getOptions()
    const condOps = getCondOps()
    const docs = hoverDocs({
      options,
      condOps,
      params: new Map([["SECONDS", "integer-special-readonly"]]),
    })
    const files = dumpText(docs)

    test("covers all vendored options and cond ops", () => {
      expect(docs.filter((doc) => doc.kind === "option")).toHaveLength(
        options.length,
      )
      expect(docs.filter((doc) => doc.kind === "cond-op")).toHaveLength(
        condOps.length,
      )
      expect((files.get("options.md")?.match(/^## /gm) ?? []).length).toBe(
        options.length,
      )
      expect((files.get("cond-ops.md")?.match(/^## /gm) ?? []).length).toBe(
        condOps.length,
      )
    })

    test("emitted markdown strips raw yodl markers", () => {
      expect(files.get("options.md")).not.toContain("tt(")
      expect(files.get("options.md")).not.toContain("var(")
      expect(files.get("cond-ops.md")).not.toContain("tt(")
      expect(files.get("cond-ops.md")).not.toContain("var(")
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
