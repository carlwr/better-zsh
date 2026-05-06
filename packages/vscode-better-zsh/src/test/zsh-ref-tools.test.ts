import { toolDefs } from "@carlwr/zsh-core-tooldef"
import { describe, expect, test, vi } from "vitest"

vi.mock("vscode", () => {
  const registered: string[] = []
  return {
    lm: {
      registerTool: (name: string) => {
        registered.push(name)
        return { dispose() {} }
      },
    },
    LanguageModelToolResult: class {
      constructor(public parts: unknown[]) {}
    },
    LanguageModelTextPart: class {
      constructor(public value: string) {}
    },
    __registered: registered,
  }
})

import * as vscodeMock from "vscode"
import { buildLmTools } from "../build/lm-tools-manifest"
import { registerZshRefTools } from "../lm-adapter/zsh-ref-tools"

describe("staged LM-tools manifest covers every toolDef", () => {
  test("buildLmTools(toolDefs) yields one entry per tooldef", () => {
    const names = (buildLmTools(toolDefs) as { name: string }[])
      .map(t => t.name)
      .sort()
    expect(names).toEqual(toolDefs.map(d => d.name).sort())
  })
})

describe("registerZshRefTools", () => {
  test("registers one VS Code LM tool per toolDef", () => {
    const vscode = vscodeMock as unknown as { __registered: string[] }
    vscode.__registered.length = 0
    const ctx = { subscriptions: [] as { dispose(): void }[] }
    registerZshRefTools(
      ctx as unknown as Parameters<typeof registerZshRefTools>[0],
      {} as unknown as Parameters<typeof registerZshRefTools>[1],
    )
    expect(vscode.__registered.sort()).toEqual(toolDefs.map(d => d.name).sort())
    expect(ctx.subscriptions.length).toBe(toolDefs.length)
  })
})
