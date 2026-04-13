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
import { wordDoc } from "./test-util"

suite("CompletionProvider", () => {
  test("offers static builtins, precmds, reserved words, and params", async () => {
    const provider = new CompletionProvider({
      builtins: [
        {
          name: mkBuiltinName("echo"),
          synopsis: ["echo"],
          desc: "",
        },
      ],
      reservedWords: [
        {
          name: mkReservedWord("if"),
          sig: "if list then list fi",
          desc: "",
          section: "Complex Commands",
          pos: "command",
        },
      ],
      precmds: [
        {
          name: "noglob",
          synopsis: ["noglob command arg ..."],
          desc: "",
        },
      ],
      params: [
        {
          name: mkShellParamName("SECONDS"),
          sig: "SECONDS",
          desc: "",
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
          desc: "",
        },
      ],
      condOps: [],
    })

    const items = (await provider.provideCompletionItems(wordDoc("ec"), {
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
