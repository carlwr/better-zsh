import * as vscode from "vscode"
import type {
  CondOpDoc,
  DocCorpus,
  DocPieceId,
  Proven,
  ZshOption,
} from "zsh-core"
import {
  filterTokens,
  matchOptions,
  mkPieceId,
  syntacticContext,
  WORD,
  WORD_EXACT,
} from "zsh-core"
import { renderDoc } from "zsh-core/render"
import { asyncDocCache } from "./cache"
import { zshTokenize } from "./zsh"

const getIds = asyncDocCache(async doc =>
  filterTokens(await zshTokenize(doc.getText())),
)

export class CompletionProvider implements vscode.CompletionItemProvider {
  private general: vscode.CompletionItem[]
  private options: readonly Proven<"option">[]
  private optionMap: ReadonlyMap<Proven<"option">, ZshOption>
  private condOps: readonly CondOpDoc[]

  constructor(corpus: DocCorpus) {
    const options = [...corpus.option.values()]
    const kw = vscode.CompletionItemKind.Keyword
    const wordCategories: readonly [
      keyof Pick<
        DocCorpus,
        "builtin" | "reserved_word" | "precmd" | "shell_param"
      >,
      vscode.CompletionItemKind,
    ][] = [
      ["builtin", kw],
      ["reserved_word", kw],
      ["precmd", kw],
      ["shell_param", vscode.CompletionItemKind.Variable],
    ]
    this.general = wordCategories.flatMap(([cat, kind]) =>
      [...corpus[cat].values()]
        .filter(isWordName)
        .map(doc =>
          mkCompletionItem(doc, kind, mkPieceId(cat, doc.name), corpus),
        ),
    )
    this.options = options.map(opt => opt.name)
    this.optionMap = new Map(options.map(o => [o.name, o]))
    this.condOps = [...corpus.cond_op.values()]
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
      .filter(id => id !== cur)
      .map(id => new vscode.CompletionItem(id, vscode.CompletionItemKind.Text))
    return [...items, ...this.general.filter(b => b.label !== cur)]
  }

  private optionCompletions(doc: vscode.TextDocument, pos: vscode.Position) {
    const curRange = doc.getWordRangeAtPosition(pos, WORD)
    const typed = curRange ? doc.getText(curRange) : ""
    const matches = matchOptions(this.options, typed)
    const items = matches.map(m => {
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
    const items = this.condOps.map(cop => {
      const item = new vscode.CompletionItem(
        cop.op,
        vscode.CompletionItemKind.Operator,
      )
      item.detail = cop.desc
      item.documentation = new vscode.MarkdownString(condSig(cop))
      return item
    })
    return new vscode.CompletionList(items, false)
  }
}

function condSig(cop: CondOpDoc): string {
  return cop.arity === "unary"
    ? `\`${cop.op}\` *${cop.operands[0]}*`
    : `*${cop.operands[0]}* \`${cop.op}\` *${cop.operands[1]}*`
}

function isWordName<T extends { name: string }>(doc: T): boolean {
  return WORD_EXACT.test(doc.name)
}

function mkCompletionItem<T extends { name: string; desc: string }>(
  doc: T,
  kind: vscode.CompletionItemKind,
  pieceId: DocPieceId,
  corpus: DocCorpus,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(doc.name, kind)
  item.detail = doc.desc
  item.documentation = new vscode.MarkdownString(renderDoc(corpus, pieceId))
  return item
}
