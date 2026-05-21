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

import type { DocCorpus } from "@carlwr/zsh-core"
import { mkDocumented, optSections } from "@carlwr/zsh-core/types"
import * as vscode from "vscode"
import { CompletionProvider } from "../editor/completions"
import { emptyCorpus, wordDoc } from "./test-util"

suite("CompletionProvider", () => {
  test("offers static commands and params", async () => {
    const builtin = {
      name: mkDocumented("builtin", "echo"),
      synopsis: ["echo"] as [string],
      desc: "",
    }
    const reservedWord = {
      name: mkDocumented("reserved_word", "if"),
      sig: "if list then list fi",
      desc: "",
      section: "Complex Commands",
      pos: "command" as const,
    }
    const precmd = {
      name: "noglob" as const,
      synopsis: ["noglob command arg ..."] as [string],
      desc: "",
    }
    const param = {
      name: mkDocumented("special_param", "SECONDS"),
      sig: "SECONDS",
      desc: "",
      scope: "shell-set" as const,
    }
    const option = {
      name: mkDocumented("option", "AUTO_CD"),
      display: "AUTO_CD",
      flags: [],
      defaultIn: ["zsh" as const],
      category: optSections[0],
      desc: "",
    }
    const corpus: DocCorpus = {
      ...emptyCorpus(),
      builtin: new Map([[builtin.name, builtin]]),
      reserved_word: new Map([[reservedWord.name, reservedWord]]),
      precmd_modifier: new Map([[precmd.name, precmd]]),
      special_param: new Map([[param.name, param]]),
      option: new Map([[option.name, option]]),
    }
    const provider = new CompletionProvider(corpus)

    const items = (await provider.provideCompletionItems(wordDoc("ec"), {
      line: 0,
      character: 0,
    } as import("vscode").Position)) as import("vscode").CompletionItem[]

    const labels = items.map(item => item.label)
    assert.ok(labels.includes("echo"))
    assert.ok(labels.includes("if"))
    assert.ok(labels.includes("noglob"))
    assert.ok(labels.includes("SECONDS"))
  })

  // The VS Code `Operator` codicon renders as a stacked `%/x` glyph that
  // reads oddly. Conditional operators should use the cleaner `Keyword`
  // icon (they are test/cond keywords).
  test("conditional operators use Keyword icon, not Operator", async () => {
    const cop = {
      op: mkDocumented("conditional_op", "=="),
      arity: "binary" as const,
      operands: ["s1", "s2"] as const,
      desc: "string equality",
    }
    const corpus: DocCorpus = {
      ...emptyCorpus(),
      conditional_op: new Map([[cop.op, cop]]),
    }
    const provider = new CompletionProvider(corpus)
    const result = await provider.provideCompletionItems(wordDoc("[[ a  ]]"), {
      line: 0,
      character: 5,
    } as import("vscode").Position)
    const items = (
      Array.isArray(result)
        ? result
        : (result as import("vscode").CompletionList).items
    ) as import("vscode").CompletionItem[]
    const eq = items.find(i => i.label === "==")
    assert.ok(eq, "expected == cond completion")
    assert.strictEqual(eq.kind, vscode.CompletionItemKind.Keyword)
    assert.notStrictEqual(eq.kind, vscode.CompletionItemKind.Operator)
  })
})
