import type { DocCorpus } from "@carlwr/zsh-core"
import {
  headFor,
  recordTitle,
  renderDocWithTitle,
} from "@carlwr/zsh-core/render"
import {
  type DocCategory,
  type DocRecordMap,
  idOf,
  mkPieceId,
} from "@carlwr/zsh-core/taxonomy"
import type { CondOpDoc, Documented } from "@carlwr/zsh-core/types"
import * as vscode from "vscode"
import { asyncDocCache } from "../cache"
import { zshTokenize } from "../zsh"
import { contextAt } from "./facts"
import { matchOptions } from "./option-match"
import { filterTokens, WORD, WORD_EXACT } from "./words"

const getIds = asyncDocCache(async doc =>
  filterTokens(await zshTokenize(doc.getText())),
)

const { CompletionItemKind: Kind } = vscode

/** Categories offered at general positions: word-named records only. */
type WordCategory =
  | "builtin"
  | "reserved_word"
  | "precmd_modifier"
  | "special_param"

const wordCategories: readonly (readonly [
  WordCategory,
  vscode.CompletionItemKind,
])[] = [
  ["builtin", Kind.Keyword],
  ["reserved_word", Kind.Keyword],
  ["precmd_modifier", Kind.Keyword],
  ["special_param", Kind.Variable],
]

export class CompletionProvider implements vscode.CompletionItemProvider {
  private general: vscode.CompletionItem[]
  private generalLabels: ReadonlySet<string>
  private options: readonly Documented<"option">[]
  private optionDocs: ReadonlyMap<Documented<"option">, vscode.MarkdownString>
  private conditionalOps: readonly CondOpDoc[]

  constructor(corpus: DocCorpus) {
    this.general = wordCategories.flatMap(([cat, kind]) =>
      [...corpus[cat].values()]
        .filter(doc => WORD_EXACT.test(doc.name))
        .map(doc => mkCompletionItem(corpus, cat, doc, kind)),
    )
    this.generalLabels = new Set(
      wordCategories.flatMap(([cat]) => [...corpus[cat].keys()]),
    )
    this.options = [...corpus.option.keys()]
    this.optionDocs = new Map(
      this.options.map(id => [id, docMarkdown(corpus, "option", id)]),
    )
    this.conditionalOps = [...corpus.conditional_op.values()]
  }

  provideCompletionItems(doc: vscode.TextDocument, pos: vscode.Position) {
    switch (contextAt(doc, pos)) {
      case "setopt":
        return this.optionCompletions(doc, pos)
      case "cond":
        return this.condCompletions()
      default:
        return this.generalCompletions(doc, pos)
    }
  }

  private async generalCompletions(
    doc: vscode.TextDocument,
    pos: vscode.Position,
  ) {
    const ids = await getIds(doc)
    const cur = wordTextAt(doc, pos)
    const items = ids
      .filter(id => id !== cur && !this.generalLabels.has(id))
      .map(id => new vscode.CompletionItem(id, Kind.Text))
    return [...items, ...this.general.filter(b => b.label !== cur)]
  }

  private optionCompletions(doc: vscode.TextDocument, pos: vscode.Position) {
    const typed = wordTextAt(doc, pos)
    const items = matchOptions(this.options, typed).map(m => {
      const item = new vscode.CompletionItem(m.label, Kind.Property)
      // Matched here modulo case and underscores; VS Code's own filter must
      // not reject the label against what was typed.
      item.filterText = typed || m.label
      item.documentation = this.optionDocs.get(m.canonical)
      return item
    })
    return new vscode.CompletionList(items, true)
  }

  private condCompletions() {
    // `CompletionItemKind.Operator`'s codicon is a stacked `%/x` glyph; `Keyword`'s
    // icon reads cleaner and is semantically close (test/cond keywords).
    const items = this.conditionalOps.map(cop => {
      const item = new vscode.CompletionItem(cop.op, Kind.Keyword)
      item.detail = cop.desc
      item.documentation = new vscode.MarkdownString(
        recordTitle("conditional_op", cop),
      )
      return item
    })
    return new vscode.CompletionList(items, false)
  }
}

function wordTextAt(doc: vscode.TextDocument, pos: vscode.Position): string {
  const range = doc.getWordRangeAtPosition(pos, WORD)
  return range ? doc.getText(range) : ""
}

const docMarkdown = <K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
  id: Documented<K>,
) => new vscode.MarkdownString(renderDocWithTitle(corpus, mkPieceId(cat, id)))

function mkCompletionItem<K extends WordCategory>(
  corpus: DocCorpus,
  cat: K,
  doc: DocRecordMap[K],
  kind: vscode.CompletionItemKind,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(doc.name, kind)
  // The one-line slot: a synopsis where the record has one; the full doc
  // travels as `documentation`.
  item.detail = headFor(cat, doc)?.lines[0]
  item.documentation = docMarkdown(corpus, cat, idOf(cat, doc))
  return item
}
