import type { ExecFileException } from "node:child_process"
import { existsSync } from "node:fs"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { mkZshBinary } from "../../zsh/binary"
import { buildZshEnv, execZsh, toRunResult } from "../../zsh/exec"

describe("buildZshEnv", () => {
  test("keeps execution basics, drops startup hooks, ignores the rest", () => {
    const env = buildZshEnv(
      {
        BASH_ENV: "/tmp/bashenv",
        ENV: "/tmp/env",
        FPATH: "/tmp/fpath",
        HOME: "/tmp/home",
        LANG: "C.UTF-8",
        PATH: "/bin:/usr/bin",
        USER: "carl",
        ZDOTDIR: "/tmp/zdotdir",
        ZZZ: "ignored",
      },
      { SRC: "echo hi" },
    )
    expect(env).toEqual({
      HOME: "/tmp/home",
      LANG: "C.UTF-8",
      PATH: "/bin:/usr/bin",
      USER: "carl",
      SRC: "echo hi",
    })
  })

  const KEEP = ["HOME", "PATH", "LANG", "USER"]
  const DROP = ["BASH_ENV", "ENV", "FPATH", "ZDOTDIR"]
  const envArb = fc.dictionary(
    fc.constantFrom(...KEEP, ...DROP, "SRC", "JUNK"),
    fc.string(),
  )

  test("only allowlisted or extra keys pass; startup hooks never do, even via extra; extra wins", () => {
    fc.assert(
      fc.property(envArb, envArb, (src, extra) => {
        const out = buildZshEnv(src, extra)
        for (const k of Object.keys(out)) {
          expect(KEEP.includes(k) || k in extra).toBe(true)
          expect(DROP).not.toContain(k)
          expect(out[k]).toBe(k in extra ? extra[k] : src[k])
        }
      }),
    )
  })
})

describe("execZsh", () => {
  test("scriptFile: written to a temp file passed last, removed afterwards", async () => {
    const r = await execZsh(mkZshBinary("/bin/sh"), {
      args: ["-c", 'printf "%s\n" "$1"; cat "$1"', "sh"],
      scriptFile: "echo hi",
    })
    const [file, ...content] = r.stdout.split("\n")
    expect(content.join("\n")).toBe("echo hi")
    expect(existsSync(file ?? "")).toBe(false)
  })
})

describe("toRunResult", () => {
  const err = (e: Partial<ExecFileException>) => e as ExecFileException
  test.each([
    ["success", null, { code: 0, errCode: undefined }],
    ["exit code", err({ code: 3 }), { code: 3, errCode: undefined }],
    ["spawn errno", err({ code: "ENOENT" }), { code: 1, errCode: "ENOENT" }],
    [
      "timeout kill",
      err({ code: null, killed: true }),
      { code: 1, errCode: "ETIMEDOUT" },
    ],
  ])("%s", (_, e, want) => {
    expect(toRunResult(e, "out", "err")).toEqual({
      stdout: "out",
      stderr: "err",
      ...want,
    })
  })
})
