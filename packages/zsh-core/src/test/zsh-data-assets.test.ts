import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { resolveZshDataDir, vendoredZshDocFiles } from "../data-dir"
import {
  mkBuiltinName,
  mkCondOp,
  mkOptName,
  mkReservedWord,
} from "../types/brand"
import * as zd from "../zsh-data"

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
    const options = zd.getOptions()
    const condOps = zd.getCondOps()

    expect(options.length).toBeGreaterThan(0)
    expect(condOps.length).toBeGreaterThan(0)
    expect(options.some((opt) => opt.name === mkOptName("AUTO_CD"))).toBe(true)
    expect(condOps.some((op) => op.op === mkCondOp("=="))).toBe(true)
  })

  test("parses vendored builtins docs", () => {
    const builtins = zd.getBuiltins()
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
    const docs = zd.getPrecmds()
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
    expect(zd.getRedirections().some((doc) => doc.groupOp === "<")).toBe(true)
    expect(
      zd.getReservedWords().some((doc) => doc.name === mkReservedWord("if")),
    ).toBe(true)
    expect(zd.getShellParams().some((doc) => doc.name === "SECONDS")).toBe(true)
    expect(zd.getSubscriptFlags().some((doc) => doc.flag === "w")).toBe(true)
    expect(zd.getParamFlags().some((doc) => doc.flag === "@")).toBe(true)
    expect(zd.getHistoryDocs().some((doc) => doc.key === "!!")).toBe(true)
    expect(zd.getGlobOps().some((doc) => doc.op === "*")).toBe(true)
    expect(zd.getGlobbingFlags().some((doc) => doc.flag === "i")).toBe(true)
    expect(zd.getProcessSubsts().map((doc) => doc.op)).toEqual([
      "<(...)",
      ">(...)",
      "=(...)",
    ])
  })
})
