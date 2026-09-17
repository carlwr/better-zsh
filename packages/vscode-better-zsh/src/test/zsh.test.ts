import { describe, expect, test, vi } from "vitest"
import { mkZshBinary } from "../ids"
import {
  parseZshPath,
  readZshPathConfig,
  type ZshPathConfig,
} from "../settings"
import { configureZsh, zshCheck, zshTokenize } from "../zsh"
import type { ZshRunResult } from "../zsh-exec"
import { stub } from "./vscode-stub"

const exec = vi.hoisted(() => ({
  spy: undefined as
    | ((binary: string) => Promise<ZshRunResult> | undefined)
    | undefined,
}))
vi.mock("../zsh-exec", async importOriginal => {
  const real = await importOriginal<typeof import("../zsh-exec")>()
  return {
    ...real,
    execZsh: (binary: string, req: Parameters<typeof real.execZsh>[1]) =>
      exec.spy?.(binary) ?? real.execZsh(binary, req),
  }
})

const def = () => parseZshPath("")

async function expectGated(cfg: ZshPathConfig) {
  configureZsh(cfg)
  try {
    expect(await zshTokenize("echo hi")).toEqual([])
    expect(await zshCheck("if")).toEqual({ kind: "unavailable" })
  } finally {
    configureZsh(def())
  }
}

describe("parseZshPath", () => {
  test.each<[string, ZshPathConfig]>([
    ["off", { kind: "disabled" }],
    ["", { kind: "default", binary: mkZshBinary("zsh") }],
    [
      "/usr/local/bin/zsh",
      { kind: "explicit", binary: mkZshBinary("/usr/local/bin/zsh") },
    ],
    ["./zsh", { kind: "invalid", raw: "./zsh", reason: "relative path" }],
    ["bin/zsh", { kind: "invalid", raw: "bin/zsh", reason: "relative path" }],
  ])("%j", (raw, want) => {
    expect(parseZshPath(raw)).toEqual(want)
  })

  // Settings JSON may hold any type; `null` reads as unset.
  test.each<[unknown, ZshPathConfig]>([
    [false, { kind: "invalid", raw: "false", reason: "not a string" }],
    [123, { kind: "invalid", raw: "123", reason: "not a string" }],
    [null, { kind: "default", binary: mkZshBinary("zsh") }],
  ])("setting %j", (value, want) => {
    stub.config.set("betterZsh.zshPath", value)
    expect(readZshPathConfig()).toEqual(want)
    stub.config.clear()
  })
})

describe("zsh mode gating", () => {
  test.each<[string, ZshPathConfig]>([
    ["disabled", { kind: "disabled" }],
    [
      "explicit nonexistent",
      { kind: "explicit", binary: mkZshBinary("/nonexistent/zsh-binary") },
    ],
    [
      "invalid relative",
      { kind: "invalid", raw: "./zsh", reason: "relative path" },
    ],
  ])("%s", async (_, cfg) => {
    await expectGated(cfg)
  })

  test("empty PATH gates runtime features", async () => {
    const origPath = process.env.PATH
    process.env.PATH = ""
    try {
      await expectGated(def())
    } finally {
      process.env.PATH = origPath
    }
  })

  test("a spawn error from an older configuration does not pin the newer one", async () => {
    // Any executable file passes the probe; the spawn itself is intercepted.
    const usable = (): ZshPathConfig => ({
      kind: "explicit",
      binary: mkZshBinary(process.execPath),
    })
    const gone = { stdout: "", stderr: "", code: 1, errCode: "ENOENT" }
    // Every spawn under the first configuration (the tokenize, the version
    // banner) stays in flight until released.
    const releases: (() => void)[] = []
    const spawning = new Promise<void>(ready => {
      exec.spy = () =>
        new Promise<ZshRunResult>(r => {
          releases.push(() => r(gone))
          ready()
        })
    })
    try {
      configureZsh(usable())
      const inFlight = zshTokenize("a")
      await spawning
      configureZsh(usable()) // newer configuration
      for (const release of releases) release()
      await inFlight
      let spawned = 0
      exec.spy = () => {
        spawned++
        return Promise.resolve({ stdout: "x\n", stderr: "", code: 0 })
      }
      // Pinned `unavailable` would short-circuit before any spawn.
      expect(await zshTokenize("x")).toEqual(["x"])
      expect(spawned).toBeGreaterThan(0)
    } finally {
      exec.spy = undefined
      configureZsh(def())
    }
  })

  test("reports syntax errors when zsh is available", async ctx => {
    configureZsh(def())
    const r = await zshCheck("echo hello\necho }\necho world\n")
    if (r.kind === "unavailable") return ctx.skip()
    expect(r).toMatchObject({ kind: "error", line: 2 })
  })
})
