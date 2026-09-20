import type { DocCategory, DocCorpus, DocRecordMap } from "@carlwr/zsh-core"
import {
  categoryFooter,
  type RenderedRecord,
  renderRecord,
} from "@carlwr/zsh-core/render"
import * as vscode from "vscode"

/**
 * A record as hovers and completion docs show it: title, body, then the
 * category line. The editor shows a record without its envelope, so the
 * category — which `renderRecord` leaves to the envelope — travels in the
 * markdown; last, after the body's option-ref bolding.
 */
export function recordMarkdown<K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
  doc: DocRecordMap[K],
): vscode.MarkdownString {
  return renderedMarkdown(renderRecord(corpus, cat, doc), cat, doc)
}

/** `recordMarkdown` for an already-rendered record (a body-less record shows title and category only). */
export function renderedMarkdown<K extends DocCategory>(
  { title, mdBody }: RenderedRecord,
  cat: K,
  doc: DocRecordMap[K],
): vscode.MarkdownString {
  return new vscode.MarkdownString(
    [title, mdBody, categoryFooter(cat, doc)].filter(Boolean).join("\n\n"),
  )
}
