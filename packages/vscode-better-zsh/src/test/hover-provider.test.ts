import * as assert from "node:assert"
import { vi } from "vitest"
import type { BuiltinDoc, RedirDoc } from "zsh-core"

vi.mock("vscode", () => ({
  Position: class {
    line: number
    character: number
    constructor(line: number, character: number) {
      this.line = line
      this.character = character
    }
  },
  Range: class {
    start: { line: number; character: number }
    end: { line: number; character: number }
    constructor(
      startLine: number,
      startChar: number,
      endLine: number,
      endChar: number,
    ) {
      this.start = { line: startLine, character: startChar }
      this.end = { line: endLine, character: endChar }
    }
  },
  Hover: class {
    contents: unknown
    range?: unknown
    constructor(contents: unknown, range?: unknown) {
      this.contents = contents
      this.range = range
    }
  },
  MarkdownString: class {
    value: string
    constructor(v = "") {
      this.value = v
    }
    appendCodeblock(v: string) {
      this.value += v
      return this
    }
  },
}))

import { HoverProvider } from "../hover"

function doc(line: string) {
  return {
    uri: { toString: () => `test://hover/${line}` },
    version: 1,
    lineCount: 1,
    lineAt() {
      return { text: line }
    },
    getText(range?: {
      start: { character: number }
      end: { character: number }
    }) {
      if (!range) return line
      return line.slice(range.start.character, range.end.character)
    },
    getWordRangeAtPosition(pos: { character: number }) {
      const ch = line[pos.character] ?? ""
      if (!/[\w-]/.test(ch)) return undefined
      let start = pos.character
      while (start > 0 && /[\w-]/.test(line[start - 1] ?? "")) start--
      let end = pos.character + 1
      while (end < line.length && /[\w-]/.test(line[end] ?? "")) end++
      return {
        start: { line: 0, character: start },
        end: { line: 0, character: end },
      }
    },
  } as unknown as import("vscode").TextDocument
}

const builtins = [
  { name: "echo", synopsis: ["echo"], desc: "echo docs" },
] as unknown as BuiltinDoc[]
const redirs = [
  { op: ">&", sig: "n>& word", desc: "redir docs", section: "x" },
] as unknown as RedirDoc[]

suite("HoverProvider", () => {
  test("builtin hover works when command is followed by semicolon", () => {
    const p = new HoverProvider(
      undefined,
      undefined,
      undefined,
      builtins,
      undefined,
      redirs,
    )
    const h = p.provideHover(doc("f() { echo; }"), {
      line: 0,
      character: 7,
    } as import("vscode").Position) as
      | { contents?: { value?: string } }
      | undefined
    assert.ok(h)
    assert.match(h?.contents?.value ?? "", /echo docs/)
  })

  test("builtin hover wins over same-line redirection facts", () => {
    const p = new HoverProvider(
      undefined,
      undefined,
      undefined,
      builtins,
      undefined,
      redirs,
    )
    const h = p.provideHover(doc("echo thing >&2"), {
      line: 0,
      character: 1,
    } as import("vscode").Position) as
      | { contents?: { value?: string } }
      | undefined
    assert.ok(h)
    assert.match(h?.contents?.value ?? "", /echo docs/)
    assert.doesNotMatch(h?.contents?.value ?? "", /redir docs/)
  })
})
