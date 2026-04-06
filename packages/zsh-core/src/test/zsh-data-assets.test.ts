import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { resolveZshDataDir } from "../data-dir"
import { mkBuiltinName, mkCondOp, mkOptName } from "../types/brand"
import { getBuiltins, getCondOps, getOptions, getPrecmds } from "../zsh-data"

const dataDir = resolveZshDataDir()

describe("vendored zsh data assets", () => {
  test("ships the full doc set expected by runtime and packaging", () => {
    for (const name of [
      "SOURCE.md",
      "builtins.yo",
      "cond.yo",
      "grammar.yo",
      "options.yo",
    ]) {
      const path = join(dataDir, name)
      expect(existsSync(path)).toBe(true)
      expect(readFileSync(path, "utf8").trim().length).toBeGreaterThan(0)
    }
  })

  test("parses vendored options and conditional operators", () => {
    const options = getOptions()
    const condOps = getCondOps()

    expect(options.length).toBeGreaterThan(0)
    expect(condOps.length).toBeGreaterThan(0)
    expect(options.some((opt) => opt.name === mkOptName("AUTO_CD"))).toBe(true)
    expect(condOps.some((op) => op.op === mkCondOp("=="))).toBe(true)
  })

  test("parses vendored builtins docs", () => {
    const builtins = getBuiltins()
    expect(builtins.length).toBeGreaterThan(0)

    const autoload = builtins.find((builtin) => builtin.name === "autoload")
    expect(autoload).toBeTruthy()
    expect(autoload?.synopsis.length).toBeGreaterThan(0)
    expect(autoload?.desc.length).toBeGreaterThan(0)
    expect(
      builtins.some((builtin) => builtin.name === mkBuiltinName("bindkey")),
    ).toBe(true)
    expect(
      builtins.some((builtin) => builtin.name === mkBuiltinName("ARG1")),
    ).toBe(false)
  })

  test("parses vendored precommand modifier docs", () => {
    const docs = getPrecmds()
    expect(docs.map((doc) => doc.name)).toEqual([
      "-",
      "builtin",
      "command",
      "exec",
      "nocorrect",
      "noglob",
    ])
  })
})
