import { funcDeclsAtLine } from "@carlwr/zsh-core/analysis"
import * as vscode from "vscode"
import { docCache } from "./cache"
import { activeWordRangeAt } from "./words"

// A `#!` line is never a docstring.
const COMMENT = /^\s*#(?!!)(.*)$/

export interface FuncDecl {
  name: string
  range: vscode.Range
  selectionRange: vscode.Range
  /** Adjacent `#` comment block: above the declaration, else below. */
  doc?: string
}

interface FuncData {
  decls: FuncDecl[]
  /** First declaration per name. */
  byName: Map<string, FuncDecl>
}

const getData = docCache(buildData)

export const funcDecls = (doc: vscode.TextDocument) => getData(doc).decls

export const funcDecl = (doc: vscode.TextDocument, name: string) =>
  getData(doc).byName.get(name)

/** A function declared in `doc` whose name is the word at `pos`. */
export function funcAt(doc: vscode.TextDocument, pos: vscode.Position) {
  const range = activeWordRangeAt(doc, pos)
  if (!range) return
  const decl = funcDecl(doc, doc.getText(range))
  return decl && { range, decl }
}

function buildData(doc: vscode.TextDocument): FuncData {
  const decls: FuncDecl[] = []
  for (let line = 0; line < doc.lineCount; line++) {
    const text = doc.lineAt(line).text
    const hits = funcDeclsAtLine(text)
    if (!hits.length) continue
    // Names declared together share the docstring.
    const docstring =
      collectComments(doc, line - 1, -1) ||
      collectComments(doc, line + 1, 1) ||
      undefined
    for (const hit of hits) {
      const end = hit.start + hit.name.length
      decls.push({
        name: hit.name,
        range: new vscode.Range(line, 0, line, text.length),
        selectionRange: new vscode.Range(line, hit.start, line, end),
        doc: docstring,
      })
    }
  }
  const byName = new Map<string, FuncDecl>()
  for (const decl of decls) {
    if (!byName.has(decl.name)) byName.set(decl.name, decl)
  }
  return { decls, byName }
}

function collectComments(
  doc: vscode.TextDocument,
  start: number,
  dir: 1 | -1,
): string | undefined {
  const lines: string[] = []
  for (let i = start; i >= 0 && i < doc.lineCount; i += dir) {
    const m = doc.lineAt(i).text.match(COMMENT)
    if (!m) break
    lines.push((m[1] ?? "").replace(/^ /, ""))
  }
  if (!lines.length) return undefined
  if (dir < 0) lines.reverse()
  return lines.join("\n")
}
