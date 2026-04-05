import * as assert from "node:assert"
import { buildZshEnv } from "../zsh"

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
