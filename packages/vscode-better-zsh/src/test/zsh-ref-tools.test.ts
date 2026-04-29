import { readFileSync } from "node:fs"
import { join } from "node:path"
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
import { registerZshRefTools } from "../zsh-ref-tools"

function readManifestTools(): readonly unknown[] {
  const pkg = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  ) as { contributes?: { languageModelTools?: readonly unknown[] } }
  return pkg.contributes?.languageModelTools ?? []
}

// Guards that `contributes.languageModelTools` (a checked-in generated
// artifact) matches what the build would produce now. Catches stale
// commits when a tooldef edit lands without a rebuild. See
// `src/build/lm-tools-manifest.ts` for the contract.
describe("contributes.languageModelTools is up-to-date", () => {
  test("committed manifest equals buildLmTools(toolDefs)", () => {
    expect(readManifestTools()).toEqual(buildLmTools(toolDefs))
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
