import { nonEmpty } from "@carlwr/typescript-extra"
import type { Lexicon } from "@carlwr/zsh-lexicon"
import { categoryFooter, renderRecord } from "@carlwr/zsh-lexicon/render"
import { describe, expect, test } from "vitest"
import * as vscode from "vscode"
import { CompletionProvider } from "../../editor/completions"
import { by, docId, emptyLexicon, ident, pos, wordDoc } from "../test-util"

const lexicon: Lexicon = {
  ...emptyLexicon(),
  builtin: by([
    {
      ...ident("builtin", "echo"),
      synopsis: nonEmpty("echo"),
      desc: "",
    },
  ]),
  reserved_word: by([
    {
      ...ident("reserved_word", "if"),
      sig: "if list then list fi",
      desc: "",
      subKind: "command" as const,
    },
  ]),
  precmd_modifier: by([
    {
      ...ident("precmd_modifier", "noglob"),
      synopsis: nonEmpty("noglob command arg ..."),
      desc: "",
    },
  ]),
  special_param: by([
    {
      ...ident("special_param", "SECONDS"),
      desc: "",
      subKind: "shell-set" as const,
    },
  ]),
  option: by([
    {
      ...ident("option", "autocd", "AUTO_CD"),
      flags: [],
      defaultIn: ["zsh" as const],
      subKind: "Changing Directories" as const,
      desc: "cd by directory name",
    },
  ]),
  conditional_op: by([
    {
      ...ident("conditional_op", "=="),
      subKind: "binary" as const,
      operands: ["s1", "s2"] as const,
      desc: "string equality",
    },
  ]),
}

const provider = new CompletionProvider(lexicon)

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
  test("general position: the file's functions and parameters (bar the current word and lexicon names), then lexicon words", async () => {
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
    // Documentation: zsh-lexicon's titled body, then the category line the
    // editor appends (`record-markdown.ts`).
    const doc = lexicon.option.get(docId("option", "autocd"))
    if (doc === undefined) throw new Error("fixture: autocd")
    const { title, mdBody } = renderRecord(lexicon, doc)
    const md = `${title}\n\n${mdBody}\n\n${categoryFooter(doc)}`
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
