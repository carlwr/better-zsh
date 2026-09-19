import { nonEmpty } from "@carlwr/typescript-extra"
import type { DocCorpus } from "@carlwr/zsh-core"
import { categoryFooter, renderRecordWithTitle } from "@carlwr/zsh-core/render"
import { mkRecordId, recordOf } from "@carlwr/zsh-core/taxonomy"
import { mkDocumented, optSections } from "@carlwr/zsh-core/types"
import { describe, expect, test } from "vitest"
import * as vscode from "vscode"
import { CompletionProvider } from "../../editor/completions"
import { by, emptyCorpus, pos, wordDoc } from "../test-util"

const corpus: DocCorpus = {
  ...emptyCorpus(),
  builtin: by("name", [
    {
      name: mkDocumented("builtin", "echo"),
      synopsis: nonEmpty("echo"),
      desc: "",
    },
  ]),
  reserved_word: by("name", [
    {
      name: mkDocumented("reserved_word", "if"),
      sig: "if list then list fi",
      desc: "",
      section: "Complex Commands",
      pos: "command" as const,
    },
  ]),
  precmd_modifier: by("name", [
    {
      name: "noglob" as const,
      synopsis: nonEmpty("noglob command arg ..."),
      desc: "",
    },
  ]),
  special_param: by("name", [
    {
      name: mkDocumented("special_param", "SECONDS"),
      desc: "",
      scope: "shell-set" as const,
    },
  ]),
  option: by("name", [
    {
      name: mkDocumented("option", "autocd"),
      display: "AUTO_CD",
      flags: [],
      defaultIn: ["zsh" as const],
      section: optSections[0],
      desc: "cd by directory name",
    },
  ]),
  conditional_op: by("op", [
    {
      op: mkDocumented("conditional_op", "=="),
      arity: "binary" as const,
      operands: ["s1", "s2"] as const,
      desc: "string equality",
    },
  ]),
}

const provider = new CompletionProvider(corpus)

async function complete(text: string, line: number, char: number) {
  const r = await provider.provideCompletionItems(
    wordDoc(text),
    pos(line, char),
  )
  const list = Array.isArray(r)
    ? new vscode.CompletionList(r, false)
    : (r as vscode.CompletionList)
  return { ...list, labels: list.items.map(i => i.label) }
}

describe("CompletionProvider", () => {
  test("general position: the file's functions and parameters (bar the current word and corpus names), then corpus words", async () => {
    const text = [
      "# says hi",
      "my-func() { print $greeting $SECONDS; }",
      "echo() { :; }",
      "ec",
    ].join("\n")
    const { items, labels } = await complete(text, 3, 1)
    expect(labels).toEqual([
      "my-func",
      "greeting",
      "echo",
      "if",
      "noglob",
      "SECONDS",
    ])
    expect(items.slice(0, 2).map(i => [i.kind, i.documentation])).toEqual([
      [vscode.CompletionItemKind.Function, "says hi"],
      [vscode.CompletionItemKind.Variable, undefined],
    ])
  })

  test("setopt position: option forms, incomplete list, filtered on the typed text", async () => {
    const { isIncomplete, items } = await complete("setopt no_au", 0, 12)
    expect(isIncomplete).toBe(true)
    // Documentation: zsh-core's titled body, then the category line the
    // editor appends (`record-markdown.ts`).
    const autocd = mkRecordId("option", mkDocumented("option", "autocd"))
    const doc = recordOf(corpus, autocd)
    if (doc === undefined) throw new Error("fixture: autocd")
    const md = `${renderRecordWithTitle(corpus, "option", doc)}\n\n${categoryFooter("option", doc)}`
    expect(items.map(i => [i.label, i.filterText, i.documentation])).toEqual([
      ["no_autocd", "no_au", new vscode.MarkdownString(md)],
    ])
  })

  // The VS Code `Operator` codicon renders as a stacked `%/x` glyph that reads
  // oddly; conditional operators use `Keyword`.
  test("cond position: operators as Keyword items", async () => {
    const { isIncomplete, items } = await complete("[[ a  ]]", 0, 5)
    expect(isIncomplete).toBe(false)
    expect(items.map(i => [i.label, i.kind])).toEqual([
      ["==", vscode.CompletionItemKind.Keyword],
    ])
  })
})
