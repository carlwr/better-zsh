import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { resolveZshDataDir, vendoredZshDocFiles } from "../data-dir"
import { mkBuiltinName, mkCondOp, mkOptName } from "../types/brand"
import {
  getBuiltins,
  getCondOps,
  getGlobbingFlags,
  getGlobOps,
  getHistoryDocs,
  getOptions,
  getParamFlags,
  getPrecmds,
  getProcessSubsts,
  getRedirections,
  getReservedWords,
  getShellParams,
  getSubscriptFlags,
} from "../zsh-data"

const dataDir = resolveZshDataDir()

describe("vendored zsh data assets", () => {
  test("ships the full doc set expected by runtime and packaging", () => {
    for (const name of vendoredZshDocFiles) {
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

  test("parses newly vendored structured syntax docs", () => {
    expect(getRedirections().some((doc) => doc.op === "<")).toBe(true)
    expect(getReservedWords().some((doc) => doc.name === "if")).toBe(true)
    expect(getShellParams().some((doc) => doc.name === "SECONDS")).toBe(true)
    expect(getSubscriptFlags().some((doc) => doc.flag === "w")).toBe(true)
    expect(getParamFlags().some((doc) => doc.flag === "@")).toBe(true)
    expect(getHistoryDocs().some((doc) => doc.key === "!!")).toBe(true)
    expect(getGlobOps().some((doc) => doc.op === "*")).toBe(true)
    expect(getGlobbingFlags().some((doc) => doc.flag === "i")).toBe(true)
    expect(getProcessSubsts().map((doc) => doc.op)).toEqual([
      "<(...)",
      ">(...)",
      "=(...)",
    ])
  })
})
