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
import { registerZshRefTools } from "../zsh-ref-tools"

// vitest is invoked from the extension package root, so relative paths from
// `process.cwd()` resolve to the package.
const pkgRoot = process.cwd()

interface ManifestTool {
  readonly name: string
  readonly modelDescription: string
  readonly inputSchema: unknown
}

function readManifestTools(): readonly ManifestTool[] {
  const pkg = JSON.parse(
    readFileSync(join(pkgRoot, "package.json"), "utf8"),
  ) as {
    contributes?: {
      languageModelTools?: readonly ManifestTool[]
    }
  }
  return pkg.contributes?.languageModelTools ?? []
}

describe("contributes.languageModelTools stays in sync with toolDefs", () => {
  test("names match one-to-one (order-insensitive)", () => {
    const manifestNames = readManifestTools()
      .map(t => t.name)
      .sort()
    const defNames = toolDefs.map(d => d.name).sort()
    expect(manifestNames).toEqual(defNames)
  })

  test("each manifest tool mirrors toolDef description + inputSchema", () => {
    const manifest = new Map(readManifestTools().map(t => [t.name, t]))
    for (const def of toolDefs) {
      const entry = manifest.get(def.name)
      expect(entry).toBeDefined()
      expect(entry?.modelDescription).toEqual(def.description)
      expect(entry?.inputSchema).toEqual(def.inputSchema)
    }
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
