import type * as vscode from "vscode"
import { syntacticContext } from "../analysis/context"
import {
  analyzeDoc,
  type Fact,
  lineStarts,
  offsetAt,
  type TextSpan,
} from "../analysis/facts"
import { docCache } from "./cache"

/** The document's facts and offset model, once per document version. */
export const docAnalysis = docCache(doc => ({
  facts: analyzeDoc(doc),
  starts: lineStarts(doc),
}))

export function contextAt(doc: vscode.TextDocument, pos: vscode.Position) {
  const { facts, starts } = docAnalysis(doc)
  return syntacticContext(facts, offsetAt(starts, pos.line, pos.character))
}

/**
 * The facts starting on `line`, spans re-based to line characters — for
 * line-oriented consumers (hover, token ranges). A fact continuing past the
 * line keeps its full length.
 */
export function lineFacts(
  doc: vscode.TextDocument,
  line: number,
): readonly Fact[] {
  const { facts, starts } = docAnalysis(doc)
  const base = starts[line] ?? 0
  const next = starts[line + 1] ?? Infinity
  const rebase = (span: TextSpan): TextSpan => ({
    start: span.start - base,
    end: span.end - base,
  })
  return facts
    .filter(f => base <= f.span.start && f.span.start < next)
    .map(f =>
      f.kind === "func-decl"
        ? { ...f, span: rebase(f.span), nameSpan: rebase(f.nameSpan) }
        : { ...f, span: rebase(f.span) },
    )
}
