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
import { optSections } from "@carlwr/zsh-core"
import { mkDocumented } from "@carlwr/zsh-core/internal"
import { CompletionProvider } from "../completions"
import { wordDoc } from "./test-util"

suite("CompletionProvider", () => {
  test("offers static builtins, precmds, reserved words, and params", async () => {
    const emptyMap = new Map() as unknown as ReadonlyMap<never, never>
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
      name: mkDocumented("shell_param", "SECONDS"),
      sig: "SECONDS",
      desc: "",
      section: "Parameters Set By The Shell" as const,
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
      builtin: new Map([[builtin.name, builtin]]),
      reserved_word: new Map([[reservedWord.name, reservedWord]]),
      precmd: new Map([[precmd.name, precmd]]),
      shell_param: new Map([[param.name, param]]),
      option: new Map([[option.name, option]]),
      cond_op: emptyMap as DocCorpus["cond_op"],
      redir: emptyMap as DocCorpus["redir"],
      process_subst: emptyMap as DocCorpus["process_subst"],
      subscript_flag: emptyMap as DocCorpus["subscript_flag"],
      param_flag: emptyMap as DocCorpus["param_flag"],
      history: emptyMap as DocCorpus["history"],
      glob_op: emptyMap as DocCorpus["glob_op"],
      glob_flag: emptyMap as DocCorpus["glob_flag"],
      prompt_escape: emptyMap as DocCorpus["prompt_escape"],
      zle_widget: emptyMap as DocCorpus["zle_widget"],
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
})
