import type { DocCorpus } from "@carlwr/zsh-core"
import { categoryFooter, renderRecordWithTitle } from "@carlwr/zsh-core/render"
import {
  type DocCategory,
  type DocRecordId,
  type DocRecordMap,
  recordOf,
} from "@carlwr/zsh-core/taxonomy"
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
  return new vscode.MarkdownString(
    `${renderRecordWithTitle(corpus, cat, doc)}\n\n${categoryFooter(cat, doc)}`,
  )
}

/** `DocRecordId`-keyed {@link recordMarkdown}; `undefined` when the corpus has no such record. */
export function docMarkdown(
  corpus: DocCorpus,
  id: DocRecordId,
): vscode.MarkdownString | undefined {
  const doc = recordOf(corpus, id)
  return doc === undefined
    ? undefined
    : recordMarkdown(corpus, id.category, doc)
}
