import { loadCorpus } from "@carlwr/zsh-core"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type * as vscode from "vscode"
import { contribute } from "../contributions"
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
})

describe("contribute", () => {
  test("registers every language feature once; test hooks only under the VS Code test runner", () => {
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
    expect(stub.registrations.filter(r => r === "command")).toHaveLength(2)
    vi.unstubAllEnvs()
  })

  test("a zsh-path setting change re-resolves the binary, then re-checks open documents", () => {
    contribute(ctx(), loadCorpus())
    stub.openDocs({
      uri: { scheme: "file", toString: () => "file:///a.zsh" },
      languageId: "zsh",
      version: 1,
      isClosed: false,
      getText: () => "echo",
    })
    zsh.zshCheck.mockClear()
    stub.fire("config", {
      affectsConfiguration: (k: string) => k === "betterZsh.zshPath",
    })
    expect(zsh.configureZsh).toHaveBeenCalledTimes(1)
    expect(zsh.zshCheck).toHaveBeenCalledTimes(1)
    expect(zsh.configureZsh.mock.invocationCallOrder[0]).toBeLessThan(
      zsh.zshCheck.mock.invocationCallOrder[0] ?? 0,
    )
    stub.fire("config", { affectsConfiguration: () => false })
    expect(zsh.configureZsh).toHaveBeenCalledTimes(1)
  })
})
