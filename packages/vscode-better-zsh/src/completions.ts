import * as vscode from "vscode"
import type {
  BuiltinDoc,
  CondOpDoc,
  OptName,
  PrecmdDoc,
  ReservedWordDoc,
  ShellParamDoc,
  ZshOption,
} from "zsh-core"
import {
  filterTokens,
  matchOptions,
  syntacticContext,
  WORD,
  WORD_EXACT,
} from "zsh-core"
import {
  mdBuiltin,
  mdPrecmd,
  mdReservedWord,
  mdShellParam,
  sigCond,
} from "zsh-core/render"
import { asyncDocCache } from "./cache"
import { zshTokenize } from "./zsh"

const getIds = asyncDocCache(async (doc) =>
  filterTokens(await zshTokenize(doc.getText())),
)

export interface CompletionData {
  builtins: readonly BuiltinDoc[]
  reservedWords: readonly ReservedWordDoc[]
  precmds: readonly PrecmdDoc[]
  params: readonly ShellParamDoc[]
  options: readonly ZshOption[]
  condOps: readonly CondOpDoc[]
}

export class CompletionProvider implements vscode.CompletionItemProvider {
  private general: vscode.CompletionItem[]
  private options: readonly OptName[]
  private optionMap: ReadonlyMap<OptName, ZshOption>
  private condOps: readonly CondOpDoc[]

  constructor(data: CompletionData) {
    this.general = [
      ...data.builtins
        .filter(isWordName)
        .map((doc) =>
          mkCompletionItem(doc, vscode.CompletionItemKind.Keyword, mdBuiltin),
        ),
      ...data.reservedWords
        .filter(isWordName)
        .map((doc) =>
          mkCompletionItem(
            doc,
            vscode.CompletionItemKind.Keyword,
            mdReservedWord,
          ),
        ),
      ...data.precmds
        .filter(isWordName)
        .map((doc) =>
          mkCompletionItem(doc, vscode.CompletionItemKind.Keyword, mdPrecmd),
        ),
      ...data.params
        .filter(isWordName)
        .map((doc) =>
          mkCompletionItem(
            doc,
            vscode.CompletionItemKind.Variable,
            mdShellParam,
          ),
        ),
    ]
    this.options = data.options.map((opt) => opt.name)
    this.optionMap = new Map(data.options.map((o) => [o.name, o]))
    this.condOps = data.condOps
  }

  async provideCompletionItems(doc: vscode.TextDocument, pos: vscode.Position) {
    const ctx = syntacticContext(doc, pos.line, pos.character)

    if (ctx.kind === "setopt") {
      return this.optionCompletions(doc, pos)
    }
    if (ctx.kind === "cond") {
      return this.condCompletions(doc, pos)
    }
    return this.generalCompletions(doc, pos)
  }

  private async generalCompletions(
    doc: vscode.TextDocument,
    pos: vscode.Position,
  ) {
    const ids = await getIds(doc)
    const curRange = doc.getWordRangeAtPosition(pos, WORD)
    const cur = curRange ? doc.getText(curRange) : ""
    const items = ids
      .filter((id) => id !== cur)
      .map(
        (id) => new vscode.CompletionItem(id, vscode.CompletionItemKind.Text),
      )
    return [...items, ...this.general.filter((b) => b.label !== cur)]
  }

  private optionCompletions(doc: vscode.TextDocument, pos: vscode.Position) {
    const curRange = doc.getWordRangeAtPosition(pos, WORD)
    const typed = curRange ? doc.getText(curRange) : ""
    const matches = matchOptions(this.options, typed)
    const items = matches.map((m) => {
      const item = new vscode.CompletionItem(
        m.label,
        vscode.CompletionItemKind.Property,
      )
      item.filterText = typed || m.label
      const opt = this.optionMap.get(m.canonical)
      if (opt) item.detail = opt.desc
      return item
    })
    return new vscode.CompletionList(items, true)
  }

  private condCompletions(_doc: vscode.TextDocument, _pos: vscode.Position) {
    const items = this.condOps.map((cop) => {
      const item = new vscode.CompletionItem(
        cop.op,
        vscode.CompletionItemKind.Operator,
      )
      item.detail = cop.desc
      item.documentation = new vscode.MarkdownString(sigCond(cop))
      return item
    })
    return new vscode.CompletionList(items, false)
  }
}

function isWordName<T extends { name: string }>(doc: T): boolean {
  return WORD_EXACT.test(doc.name)
}

function mkCompletionItem<T extends { name: string; desc: string }>(
  doc: T,
  kind: vscode.CompletionItemKind,
  md: (doc: T) => string,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(doc.name, kind)
  item.detail = doc.desc
  item.documentation = new vscode.MarkdownString(md(doc))
  return item
}
