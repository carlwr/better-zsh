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

const def = () => parseZshPath("")

async function expectGated(cfg: ZshPathConfig) {
  configureZsh(cfg)
  try {
    assert.strictEqual(await zshAvailable(), false)
    assert.deepStrictEqual(await zshTokenize("echo hi"), [])
    assert.deepStrictEqual(await zshCheck("if"), { ok: "unavailable" })
  } finally {
    configureZsh(def())
  }
}

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
  for (const [name, raw, want] of [
    ["off → disabled", "off", { kind: "disabled" }],
    ["empty → default", "", { kind: "default", binary: "zsh" }],
    [
      "absolute → explicit",
      "/usr/local/bin/zsh",
      { kind: "explicit", binary: "/usr/local/bin/zsh" },
    ],
    [
      "./ → invalid",
      "./zsh",
      { kind: "invalid", raw: "./zsh", reason: "relative" },
    ],
    [
      "nested relative → invalid",
      "bin/zsh",
      { kind: "invalid", raw: "bin/zsh", reason: "relative" },
    ],
  ] as const) {
    test(name, () => {
      assert.deepStrictEqual(parseZshPath(raw), want)
    })
  }
})

suite("zsh mode gating", () => {
  const disabled: ZshPathConfig = { kind: "disabled" }
  const invalidRelative: ZshPathConfig = {
    kind: "invalid",
    raw: "./zsh",
    reason: "relative",
  }
  const explicitBad: ZshPathConfig = {
    kind: "explicit",
    binary: mkZshBinary("/nonexistent/zsh-binary"),
  }

  for (const [name, cfg] of [
    ["disabled", disabled],
    ["explicit nonexistent", explicitBad],
    ["invalid relative", invalidRelative],
  ] as const) {
    test(name, async () => {
      await expectGated(cfg)
    })
  }

  test("empty PATH gates runtime features", async () => {
    const origPath = process.env.PATH
    process.env.PATH = ""
    try {
      await expectGated(def())
    } finally {
      process.env.PATH = origPath
    }
  })

  test("reports syntax errors when zsh is available", async () => {
    configureZsh(def())
    if (!(await zshAvailable())) return
    const r = await zshCheck("echo hello\nif then\necho world\n")
    assert.strictEqual(r.ok, false)
  })
})
