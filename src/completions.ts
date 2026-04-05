import * as vscode from "vscode"
import { asyncDocCache } from "./cache"
import { syntacticContext } from "./context"
import { sigCond } from "./hover-md"
import { matchOptions } from "./option-match"
import { mkOptName } from "./types/brand"
import type { CondOperator, ZshOption } from "./types/zsh-data"
import { filterTokens, WORD, WORD_EXACT, zshTokenize } from "./zsh"

const getIds = asyncDocCache(async (doc) =>
  filterTokens(await zshTokenize(doc.getText())),
)

export interface CompletionData {
  builtins: string[]
  reswords: string[]
  options: string[]
  params: Map<string, string>
  zshOptions?: ZshOption[]
  condOps?: CondOperator[]
}

export class CompletionProvider implements vscode.CompletionItemProvider {
  private general: vscode.CompletionItem[]
  private options: string[]
  private optionMap: Map<string, ZshOption> | undefined
  private condOps: CondOperator[]

  constructor(data: CompletionData) {
    this.general = [
      ...data.builtins
        .filter((n) => WORD_EXACT.test(n))
        .map(
          (n) =>
            new vscode.CompletionItem(n, vscode.CompletionItemKind.Keyword),
        ),
      ...data.reswords
        .filter((n) => WORD_EXACT.test(n))
        .map(
          (n) =>
            new vscode.CompletionItem(n, vscode.CompletionItemKind.Keyword),
        ),
      ...[...data.params.keys()]
        .filter((n) => WORD_EXACT.test(n))
        .map(
          (n) =>
            new vscode.CompletionItem(n, vscode.CompletionItemKind.Variable),
        ),
    ]
    this.options = data.options
    if (data.zshOptions) {
      this.optionMap = new Map(
        data.zshOptions.map((o) => [o.name as string, o]),
      )
    }
    this.condOps = data.condOps ?? []
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
      // Enrich with description from parsed options data
      if (this.optionMap) {
        const opt = this.optionMap.get(mkOptName(m.canonical))
        if (opt) item.detail = opt.desc
      }
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
