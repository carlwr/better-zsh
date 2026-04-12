import * as assert from "node:assert"
import { vi } from "vitest"

vi.mock("vscode", () => ({
  CompletionItem: class {
    label: string
    kind: number
    detail?: string
    documentation?: unknown
    filterText?: string
    constructor(label: string, kind: number) {
      this.label = label
      this.kind = kind
    }
  },
  CompletionList: class {
    items: unknown[]
    isIncomplete: boolean
    constructor(items: unknown[], isIncomplete: boolean) {
      this.items = items
      this.isIncomplete = isIncomplete
    }
  },
  MarkdownString: class {
    value: string
    constructor(value = "") {
      this.value = value
    }
  },
  CompletionItemKind: {
    Keyword: 1,
    Variable: 2,
    Property: 3,
    Operator: 4,
    Text: 5,
  },
}))

vi.mock("../zsh", () => ({
  zshTokenize: vi.fn(async () => []),
}))

import {
  mkBuiltinName,
  mkOptName,
  mkReservedWord,
  mkShellParamName,
  optionCategories,
} from "zsh-core"
import { CompletionProvider } from "../completions"

let id = 0

function doc(text: string) {
  return {
    uri: { toString: () => `test://completion/${id++}` },
    version: 1,
    lineCount: 1,
    lineAt() {
      return { text }
    },
    getText(range?: {
      start: { character: number }
      end: { character: number }
    }) {
      if (!range) return text
      return text.slice(range.start.character, range.end.character)
    },
    getWordRangeAtPosition(pos: { character: number }) {
      const ch = text[pos.character] ?? ""
      if (!/[\w-]/.test(ch)) return undefined
      let start = pos.character
      while (start > 0 && /[\w-]/.test(text[start - 1] ?? "")) start--
      let end = pos.character + 1
      while (end < text.length && /[\w-]/.test(text[end] ?? "")) end++
      return {
        start: { line: 0, character: start },
        end: { line: 0, character: end },
      }
    },
  } as unknown as import("vscode").TextDocument
}

suite("CompletionProvider", () => {
  test("offers static builtins, precmds, reserved words, and params", async () => {
    const provider = new CompletionProvider({
      builtins: [
        {
          name: mkBuiltinName("echo"),
          synopsis: ["echo"],
          desc: "echo docs",
        },
      ],
      reservedWords: [
        {
          name: mkReservedWord("if"),
          sig: "if list then list fi",
          desc: "if docs",
          section: "Complex Commands",
          pos: "command",
        },
      ],
      precmds: [
        {
          name: "noglob",
          synopsis: ["noglob command arg ..."],
          desc: "noglob docs",
        },
      ],
      params: [
        {
          name: mkShellParamName("SECONDS"),
          sig: "SECONDS",
          desc: "SECONDS docs",
          section: "Parameters Set By The Shell",
        },
      ],
      options: [
        {
          name: mkOptName("AUTO_CD"),
          display: "AUTO_CD",
          flags: [],
          defaultIn: ["zsh"],
          category: optionCategories[0],
          desc: "AUTO_CD docs",
        },
      ],
      condOps: [],
    })

    const items = (await provider.provideCompletionItems(doc("ec"), {
      line: 0,
      character: 0,
    } as import("vscode").Position)) as import("vscode").CompletionItem[]

    const labels = items.map((item) => item.label)
    assert.ok(labels.includes("echo"))
    assert.ok(labels.includes("if"))
    assert.ok(labels.includes("noglob"))
    assert.ok(labels.includes("SECONDS"))
  })
})
