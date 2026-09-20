import { cached } from "@carlwr/typescript-extra"
import type { DocCategory, DocCorpus, DocRecordMap } from "@carlwr/zsh-core"
import { renderRecord } from "@carlwr/zsh-core/render"
import * as vscode from "vscode"
import { contextAt } from "../document/facts"
import { funcDecls } from "../document/funcs"
import { paramNames } from "../document/params"
import { WORD, WORD_EXACT } from "../document/words"
import { matchOptions } from "./option-match"
import { recordMarkdown, renderedMarkdown } from "./record-markdown"

const { CompletionItemKind: Kind } = vscode

/** Categories offered at general positions — word-named records only — with their item kind. */
const wordCategories = [
  ["builtin", Kind.Keyword],
  ["reserved_word", Kind.Keyword],
  ["precmd_modifier", Kind.Keyword],
  ["special_param", Kind.Variable],
] as const satisfies readonly (readonly [
  DocCategory,
  vscode.CompletionItemKind,
])[]

type WordCategory = (typeof wordCategories)[number][0]

export class CompletionProvider implements vscode.CompletionItemProvider {
  // Each table is built by the first request that reads it, never twice: a
  // completion in one context pays for neither the categories nor the
  // rendered docs of another.
  private general = cached(() =>
    wordCategories.flatMap(([cat, kind]) =>
      [...this.corpus[cat].values()]
        .filter(doc => WORD_EXACT.test(doc.id))
        .map(doc => mkCompletionItem(this.corpus, cat, doc, kind)),
    ),
  )
  private generalLabels = cached(
    () =>
      new Set<string>(
        wordCategories.flatMap(([cat]) => [...this.corpus[cat].keys()]),
      ),
  )
  private options = cached(() => [...this.corpus.option.keys()])
  private optionDocs = cached(
    () =>
      new Map(
        [...this.corpus.option.values()].map(doc => [
          doc.id,
          recordMarkdown(this.corpus, "option", doc),
        ]),
      ),
  )
  // `CompletionItemKind.Operator`'s codicon is a stacked `%/x` glyph; `Keyword`'s
  // icon reads cleaner and is semantically close (test/cond keywords).
  private condItems = cached(() =>
    [...this.corpus.conditional_op.values()].map(cop => {
      const item = new vscode.CompletionItem(cop.id, Kind.Keyword)
      item.detail = cop.desc
      item.documentation = new vscode.MarkdownString(
        renderRecord(this.corpus, "conditional_op", cop).title,
      )
      return item
    }),
  )

  constructor(private corpus: DocCorpus) {}

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

  // The file's own symbols first: its functions (docstring as documentation)
  // and its parameters; corpus words win a name clash.
  private generalCompletions(doc: vscode.TextDocument, pos: vscode.Position) {
    const cur = wordTextAt(doc, pos)
    const labels = this.generalLabels()
    const own = (name: string) => name !== cur && !labels.has(name)
    const funcs = funcDecls(doc)
      .filter(d => own(d.name))
      .map(d => {
        const item = new vscode.CompletionItem(d.name, Kind.Function)
        item.documentation = d.doc
        return item
      })
    const params = paramNames(doc)
      .filter(own)
      .map(name => new vscode.CompletionItem(name, Kind.Variable))
    return [...funcs, ...params, ...this.general().filter(b => b.label !== cur)]
  }

  private optionCompletions(doc: vscode.TextDocument, pos: vscode.Position) {
    const typed = wordTextAt(doc, pos)
    const optionDocs = this.optionDocs()
    const items = matchOptions(this.options(), typed).map(m => {
      const item = new vscode.CompletionItem(m.label, Kind.Property)
      // Matched here modulo case and underscores; VS Code's own filter must
      // not reject the label against what was typed.
      item.filterText = typed || m.label
      item.documentation = optionDocs.get(m.canonical)
      return item
    })
    return new vscode.CompletionList(items, true)
  }

  private condCompletions() {
    return new vscode.CompletionList(this.condItems(), false)
  }
}

function wordTextAt(doc: vscode.TextDocument, pos: vscode.Position): string {
  const range = doc.getWordRangeAtPosition(pos, WORD)
  return range ? doc.getText(range) : ""
}

function mkCompletionItem<K extends WordCategory>(
  corpus: DocCorpus,
  cat: K,
  doc: DocRecordMap[K],
  kind: vscode.CompletionItemKind,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(doc.id, kind)
  const rendered = renderRecord(corpus, cat, doc)
  // The one-line slot: a synopsis where the record has one; the full doc
  // travels as `documentation`.
  item.detail = rendered.head?.lines[0]
  item.documentation = renderedMarkdown(rendered, cat, doc)
  return item
}
