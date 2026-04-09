import * as assert from "node:assert"
import { mkZshBinary } from "../ids"
import { parseZshPath, type ZshPathConfig } from "../settings"
import {
  buildZshEnv,
  configureZsh,
  zshAvailable,
  zshCheck,
  zshTokenize,
} from "../zsh"

suite("buildZshEnv", () => {
  test("keeps execution basics and drops startup hooks", () => {
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
    assert.strictEqual(env.PATH, "/bin:/usr/bin")
    assert.strictEqual(env.HOME, "/tmp/home")
    assert.strictEqual(env.LANG, "C.UTF-8")
    assert.strictEqual(env.USER, "carl")
    assert.strictEqual(env.SRC, "echo hi")
    assert.strictEqual(env.ZDOTDIR, undefined)
    assert.strictEqual(env.FPATH, undefined)
    assert.strictEqual(env.ENV, undefined)
    assert.strictEqual(env.BASH_ENV, undefined)
    assert.strictEqual(env.ZZZ, undefined)
  })

  test("extra env can override kept values", () => {
    const env = buildZshEnv({ PATH: "/bin" }, { PATH: "/opt/bin", SRC: "x" })
    assert.strictEqual(env.PATH, "/opt/bin")
    assert.strictEqual(env.SRC, "x")
  })
})

suite("parseZshPath", () => {
  test("off → disabled", () => {
    assert.deepStrictEqual(parseZshPath("off"), { kind: "disabled" })
  })

  test("empty → default with 'zsh' binary", () => {
    const r = parseZshPath("")
    assert.strictEqual(r.kind, "default")
    assert.strictEqual((r as { binary: string }).binary, "zsh")
  })

  test("explicit path → explicit", () => {
    const r = parseZshPath("/usr/local/bin/zsh")
    assert.strictEqual(r.kind, "explicit")
    assert.strictEqual((r as { binary: string }).binary, "/usr/local/bin/zsh")
  })
})

suite("zsh mode gating", () => {
  const disabled: ZshPathConfig = { kind: "disabled" }
  const explicitBad: ZshPathConfig = {
    kind: "explicit",
    binary: mkZshBinary("/nonexistent/zsh-binary"),
  }

  test("disabled config gates runtime features", async () => {
    configureZsh(disabled)
    try {
      assert.strictEqual(await zshAvailable(), false)
      assert.deepStrictEqual(await zshTokenize("echo hi"), [])
      assert.deepStrictEqual(await zshCheck("if"), { ok: "unavailable" })
    } finally {
      configureZsh(parseZshPath(""))
    }
  })

  test("explicit non-existent path gates runtime features", async () => {
    configureZsh(explicitBad)
    try {
      assert.strictEqual(await zshAvailable(), false)
      assert.deepStrictEqual(await zshTokenize("echo hi"), [])
      assert.deepStrictEqual(await zshCheck("if"), { ok: "unavailable" })
    } finally {
      configureZsh(parseZshPath(""))
    }
  })

  test("empty PATH gates runtime features", async () => {
    const origPath = process.env.PATH
    process.env.PATH = ""
    configureZsh(parseZshPath(""))
    try {
      assert.strictEqual(await zshAvailable(), false)
      assert.deepStrictEqual(await zshTokenize("echo hi"), [])
      assert.deepStrictEqual(await zshCheck("if"), { ok: "unavailable" })
    } finally {
      process.env.PATH = origPath
      configureZsh(parseZshPath(""))
    }
  })

  test("reports syntax errors when zsh is available", async () => {
    configureZsh(parseZshPath(""))
    if (!(await zshAvailable())) return
    const r = await zshCheck("echo hello\nif then\necho world\n")
    assert.strictEqual(r.ok, false)
  })
})
