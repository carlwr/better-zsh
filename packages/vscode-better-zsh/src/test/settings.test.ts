import { describe, expect, test } from "vitest"
import { settings } from "../manifest/settings"
import {
  parseZshPath,
  readZshConfig,
  readZshPathConfig,
  type ZshPathConfig,
} from "../settings"
import { mkZshBinary } from "../zsh/binary"
import { stub, workspace } from "./vscode-stub"

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
    [
      { toString: 1 },
      { kind: "invalid", raw: '{"toString":1}', reason: "not a string" },
    ],
    [null, { kind: "default", binary: mkZshBinary("zsh") }],
  ])("setting %j", (value, want) => {
    stub.config.set(settings.zshPath.key, value)
    expect(readZshPathConfig()).toEqual(want)
    stub.config.clear()
  })
})

describe("readZshConfig", () => {
  test("an untrusted workspace overrides the path setting", () => {
    stub.config.set(settings.zshPath.key, "/usr/local/bin/zsh")
    workspace.isTrusted = false
    expect(readZshConfig()).toEqual({ kind: "untrusted" })
    workspace.isTrusted = true
    expect(readZshConfig()).toEqual(parseZshPath("/usr/local/bin/zsh"))
    stub.config.clear()
  })
})
