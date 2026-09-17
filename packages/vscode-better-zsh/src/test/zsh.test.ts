import { describe, expect, test, vi } from "vitest"
import { recentLogs } from "../log"
import { parseZshPath, type ZshPathConfig } from "../settings"
import { configureZsh, zshCheck, zshTokenize } from "../zsh"
import { mkZshBinary, type ZshBinary } from "../zsh/binary"
import type { ZshRunResult } from "../zsh/exec"

const exec = vi.hoisted(() => ({
  spy: undefined as
    | ((binary: string) => Promise<ZshRunResult> | undefined)
    | undefined,
}))
vi.mock("../zsh/exec", async importOriginal => {
  const real = await importOriginal<typeof import("../zsh/exec")>()
  return {
    ...real,
    execZsh: (binary: ZshBinary, req: Parameters<typeof real.execZsh>[1]) =>
      exec.spy?.(binary) ?? real.execZsh(binary, req),
  }
})

const def = () => parseZshPath("")

/** Runtime features stay silent, and the resolution is logged (the container matrix greps for `logged`). */
async function expectGated(cfg: ZshPathConfig, logged: string) {
  configureZsh(cfg)
  try {
    expect(await zshTokenize("echo hi")).toEqual([])
    expect(await zshCheck("if")).toEqual({ kind: "unavailable" })
    expect(recentLogs()).toContain(`info: zsh: ${logged}`)
  } finally {
    configureZsh(def())
  }
}

describe("zsh mode gating", () => {
  test.each<[string, ZshPathConfig, string]>([
    ["disabled", { kind: "disabled" }, "disabled via betterZsh.zshPath=off"],
    [
      "explicit nonexistent",
      { kind: "explicit", binary: mkZshBinary("/nonexistent/zsh-binary") },
      "configured path /nonexistent/zsh-binary (not found)",
    ],
    [
      "invalid relative",
      { kind: "invalid", raw: "./zsh", reason: "relative path" },
      "invalid configured path ./zsh (relative path)",
    ],
  ])("%s", async (_, cfg, logged) => {
    await expectGated(cfg, logged)
  })

  test("empty PATH gates runtime features", async () => {
    const origPath = process.env.PATH
    process.env.PATH = ""
    try {
      await expectGated(def(), "PATH lookup for zsh -> unresolved")
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
