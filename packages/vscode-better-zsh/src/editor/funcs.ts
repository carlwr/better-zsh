import { escapeRegExp } from "@carlwr/typescript-extra"
import { funcDeclAtLine } from "@carlwr/zsh-core/analysis"
import * as vscode from "vscode"
import { docCache } from "../cache"
import { activeEnd, activeText, WORD, WORD_EXACT } from "./words"

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

/** The word at `pos`, unless in a comment; strings stay active — zsh meta-programming passes function names through quotes. */
export function activeWordRangeAt(
  doc: vscode.TextDocument,
  pos: vscode.Position,
): vscode.Range | undefined {
  const range = doc.getWordRangeAtPosition(pos, WORD)
  if (!range) return
  if (range.start.character >= activeEnd(doc.lineAt(pos.line).text)) return
  return range
}

/** Whole-word occurrences of `word` outside comments. */
export function wordMatches(
  doc: vscode.TextDocument,
  word: string,
): vscode.Range[] {
  if (!WORD_EXACT.test(word)) return []
  const re = new RegExp(`(?<![\\w-])${escapeRegExp(word)}(?![\\w-])`, "g")
  const out: vscode.Range[] = []
  for (let line = 0; line < doc.lineCount; line++) {
    const active = activeText(doc.lineAt(line).text)
    for (const m of active.matchAll(re))
      out.push(new vscode.Range(line, m.index, line, m.index + word.length))
  }
  return out
}

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
    const hit = funcDeclAtLine(text)
    if (!hit) continue
    const end = hit.start + hit.name.length
    decls.push({
      name: hit.name,
      range: new vscode.Range(line, 0, line, text.length),
      selectionRange: new vscode.Range(line, hit.start, line, end),
      doc:
        collectComments(doc, line - 1, -1) ||
        collectComments(doc, line + 1, 1) ||
        undefined,
    })
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
