import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { ZSH_UPSTREAM } from "@carlwr/zsh-core"
import { describe, expect, test } from "vitest"
import { decide, helpText, type PkgIdentity, ttyHintText } from "../cli.ts"
import {
  MCP_BIN_NAME,
  PKG_NAME,
  PKG_REPO_URL,
  PKG_VERSION,
} from "../pkg-info.ts"

const sentinel: PkgIdentity = {
  bin: "bin-xyz",
  version: "9.9.9",
  pkgName: "@scope/pkg-xyz",
  repo: "https://example.test/pkg",
}

describe("cli decide", () => {
  test.each([
    { argv: ["--help"], isTTY: false, action: "help" },
    { argv: ["-h"], isTTY: false, action: "help" },
    { argv: ["--version"], isTTY: false, action: "version" },
    { argv: ["-V"], isTTY: false, action: "version" },
    { argv: [], isTTY: true, action: "tty-hint" },
    { argv: [], isTTY: false, action: "run" },
    // flags win over TTY detection — consistent with stdlib cli tools
    { argv: ["--help"], isTTY: true, action: "help" },
    { argv: ["--version"], isTTY: true, action: "version" },
  ] as const)("argv=$argv, isTTY=$isTTY → $action", ({
    argv,
    isTTY,
    action,
  }) => {
    expect(decide({ argv, isTTY })).toBe(action)
  })

  test("unknown flags fall through to run/tty-hint", () => {
    expect(decide({ argv: ["--what"], isTTY: false })).toBe("run")
    expect(decide({ argv: ["--what"], isTTY: true })).toBe("tty-hint")
  })
})

describe("cli text", () => {
  test("helpText interpolates every identity field + both flags", () => {
    const t = helpText(sentinel)
    expect(t).toContain(sentinel.bin)
    expect(t).toContain(sentinel.version)
    expect(t).toContain(sentinel.pkgName)
    expect(t).toContain(sentinel.repo)
    expect(t).toMatch(/--help/)
    expect(t).toMatch(/--version/)
  })

  test("ttyHintText uses bin + version but not pkg/repo", () => {
    const t = ttyHintText(sentinel)
    expect(t).toContain(sentinel.bin)
    expect(t).toContain(sentinel.version)
    expect(t).toMatch(/--help/)
    // keep the hint short: don't force install/repo boilerplate here
    expect(t).not.toContain(sentinel.pkgName)
    expect(t).not.toContain(sentinel.repo)
  })
})

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = join(here, "..", "..")
const serverEntry = join(pkgDir, "dist", "server.mjs")
const describeIfBuilt = existsSync(serverEntry) ? describe : describe.skip
const run = promisify(execFile)

describeIfBuilt("cli bin end-to-end", () => {
  test("--help exits 0 and prints help on stdout", async () => {
    const { stdout, stderr } = await run(process.execPath, [
      serverEntry,
      "--help",
    ])
    expect(stdout).toContain(MCP_BIN_NAME)
    expect(stdout).toContain(PKG_NAME)
    expect(stdout).toContain(PKG_REPO_URL)
    expect(stdout).toMatch(/--help/)
    expect(stderr).toBe("")
  })

  test("--version exits 0 and prints package + upstream zsh identity", async () => {
    const { stdout } = await run(process.execPath, [serverEntry, "--version"])
    expect(stdout).toContain(PKG_VERSION)
    expect(stdout).toContain(ZSH_UPSTREAM.tag)
    expect(stdout).toContain(ZSH_UPSTREAM.commit.slice(0, 7))
  })

  test("-V short form works", async () => {
    const { stdout } = await run(process.execPath, [serverEntry, "-V"])
    expect(stdout).toContain(PKG_VERSION)
    expect(stdout).toContain(ZSH_UPSTREAM.tag)
  })
})
