import {
  analyzeDoc,
  lineStarts,
  offsetAt,
  syntacticContext,
} from "@carlwr/zsh-core/analysis"
import type * as vscode from "vscode"
import { docCache } from "./cache"

/** The document's facts and offset model, once per document version. */
export const docAnalysis = docCache(doc => ({
  facts: analyzeDoc(doc),
  starts: lineStarts(doc),
}))

export function contextAt(doc: vscode.TextDocument, pos: vscode.Position) {
  const { facts, starts } = docAnalysis(doc)
  return syntacticContext(facts, offsetAt(starts, pos.line, pos.character)).kind
}
