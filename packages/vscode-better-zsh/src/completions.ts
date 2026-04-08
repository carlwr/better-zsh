import * as vscode from "vscode"
import type {
  BuiltinDoc,
  CondOpDoc,
  PrecmdDoc,
  ReservedWordDoc,
  ShellParamDoc,
  ZshOption,
} from "zsh-core"
import {
  filterTokens,
  matchOptions,
  mkOptName,
  syntacticContext,
  WORD,
  WORD_EXACT,
} from "zsh-core"
import {
  mdBuiltin,
  mdParam,
  mdPrecmd,
  mdReservedWord,
  sigCond,
} from "zsh-core/render"
import { asyncDocCache } from "./cache"
import { zshTokenize } from "./zsh"

const getIds = asyncDocCache(async (doc) =>
  filterTokens(await zshTokenize(doc.getText())),
)

export interface CompletionData {
  builtins: BuiltinDoc[]
  reservedWords: ReservedWordDoc[]
  precmds: PrecmdDoc[]
  params: ShellParamDoc[]
  options: ZshOption[]
  condOps: CondOpDoc[]
}

export class CompletionProvider implements vscode.CompletionItemProvider {
  private general: vscode.CompletionItem[]
  private options: string[]
  private optionMap: Map<string, ZshOption>
  private condOps: CondOpDoc[]

  constructor(data: CompletionData) {
    this.general = [
      ...data.builtins
        .filter((doc) => WORD_EXACT.test(doc.name as string))
        .map((doc) => {
          const item = new vscode.CompletionItem(
            doc.name as string,
            vscode.CompletionItemKind.Keyword,
          )
          item.detail = doc.desc
          item.documentation = new vscode.MarkdownString(mdBuiltin(doc))
          return item
        }),
      ...data.reservedWords
        .filter((doc) => WORD_EXACT.test(doc.name))
        .map((doc) => {
          const item = new vscode.CompletionItem(
            doc.name,
            vscode.CompletionItemKind.Keyword,
          )
          item.detail = doc.desc
          item.documentation = new vscode.MarkdownString(mdReservedWord(doc))
          return item
        }),
      ...data.precmds
        .filter((doc) => WORD_EXACT.test(doc.name))
        .map((doc) => {
          const item = new vscode.CompletionItem(
            doc.name,
            vscode.CompletionItemKind.Keyword,
          )
          item.detail = doc.desc
          item.documentation = new vscode.MarkdownString(mdPrecmd(doc))
          return item
        }),
      ...data.params
        .filter((doc) => WORD_EXACT.test(doc.name))
        .map((doc) => {
          const item = new vscode.CompletionItem(
            doc.name,
            vscode.CompletionItemKind.Variable,
          )
          item.detail = doc.desc
          item.documentation = new vscode.MarkdownString(mdParam(doc))
          return item
        }),
    ]
    this.options = data.options.map((opt) => opt.name as string)
    this.optionMap = new Map(data.options.map((o) => [o.name as string, o]))
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
      const opt = this.optionMap.get(mkOptName(m.canonical))
      if (opt) item.detail = opt.desc
      return item
    })
    return new vscode.CompletionList(items, true)
  }

  private condCompletions(_doc: vscode.TextDocument, _pos: vscode.Position) {
    const items = this.condOps.map((cop) => {
      const item = new vscode.CompletionItem(
        cop.op as string,
        vscode.CompletionItemKind.Operator,
      )
      item.detail = cop.desc
      item.documentation = new vscode.MarkdownString(sigCond(cop))
      return item
    })
    return new vscode.CompletionList(items, false)
  }
}
