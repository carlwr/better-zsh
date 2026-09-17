import { loadCorpus } from "@carlwr/zsh-core"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type * as vscode from "vscode"
import { contribute } from "../contributions"
import { ZSH_LANG_ID } from "../ids"
import { settings } from "../manifest/settings"
import { stub } from "./vscode-stub"

const zsh = vi.hoisted(() => ({
  configureZsh: vi.fn(),
  zshCheck: vi.fn(async () => ({ kind: "unavailable" as const })),
  zshTokenize: vi.fn(async () => []),
}))
vi.mock("../zsh", () => zsh)

const ctx = () =>
  ({ subscriptions: [] as { dispose(): void }[] }) as vscode.ExtensionContext

beforeEach(() => {
  stub.reset()
  zsh.configureZsh.mockClear()
  zsh.zshCheck.mockClear()
})

describe("contribute", () => {
  test("registers every language feature once; the test hook only under the VS Code test runner", () => {
    vi.stubEnv("VSCODE_TEST_OPTIONS", "")
    contribute(ctx(), loadCorpus())
    expect(stub.registrations.sort()).toEqual([
      "completion",
      "definition",
      "documentLink",
      "documentSymbol",
      "highlight",
      "hover",
      "reference",
      "rename",
      "semanticTokens",
      "workspaceSymbol",
    ])

    stub.reset()
    vi.stubEnv("VSCODE_TEST_OPTIONS", "{}")
    contribute(ctx(), loadCorpus())
    expect(stub.registrations.filter(r => r === "command")).toHaveLength(1)
    vi.unstubAllEnvs()
  })

  // The zsh gate is configured from settings before each diagnostics pass
  // that reads it: at activation, and again when the setting changes.
  test("zsh is configured before open documents are checked; a zsh-path change repeats both", () => {
    const configuredBeforeChecked = () =>
      expect(zsh.configureZsh.mock.invocationCallOrder.at(-1)).toBeLessThan(
        zsh.zshCheck.mock.invocationCallOrder.at(-1) ?? 0,
      )
    stub.openDocs({
      uri: { scheme: "file", toString: () => "file:///a.zsh" },
      languageId: ZSH_LANG_ID,
      version: 1,
      isClosed: false,
      getText: () => "echo",
    })
    contribute(ctx(), loadCorpus())
    expect(zsh.configureZsh).toHaveBeenCalledTimes(1)
    expect(zsh.zshCheck).toHaveBeenCalledTimes(1)
    configuredBeforeChecked()

    stub.fire("config", {
      affectsConfiguration: (k: string) => k === settings.zshPath.key,
    })
    expect(zsh.configureZsh).toHaveBeenCalledTimes(2)
    expect(zsh.zshCheck).toHaveBeenCalledTimes(2)
    configuredBeforeChecked()

    stub.fire("config", { affectsConfiguration: () => false })
    expect(zsh.configureZsh).toHaveBeenCalledTimes(2)
  })
})
