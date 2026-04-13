import * as vscode from "vscode"
import { commentStart, escRe, funcDeclAtLine, WORD, WORD_EXACT } from "zsh-core"
import { docCache } from "./cache"

const COMMENT = /^\s*#(.*)$/

export interface FuncDecl {
  name: string
  range: vscode.Range
  selectionRange: vscode.Range
}

interface FuncData {
  docs: Map<string, string>
  funcs: FuncDecl[]
  names: Set<string>
}

const getData = docCache(buildData)

export function activeWordRangeAt(
  doc: vscode.TextDocument,
  pos: vscode.Position,
): vscode.Range | undefined {
  const range = doc.getWordRangeAtPosition(pos, WORD)
  if (!range) return
  // Treat comments as inactive syntax, but keep strings active: zsh meta-programming
  // commonly passes function names through quotes.
  const cut = commentStart(doc.lineAt(pos.line).text)
  if (cut !== undefined && range.start.character >= cut) return
  return range
}

export function wordMatches(
  doc: vscode.TextDocument,
  word: string,
): vscode.Range[] {
  if (!WORD_EXACT.test(word)) return []
  const re = new RegExp(`(?<![\\w-])${escRe(word)}(?![\\w-])`, "g")
  const out: vscode.Range[] = []
  for (let line = 0; line < doc.lineCount; line++) {
    const text = doc.lineAt(line).text
    // Keep matching logic aligned with highlights/rename: skip comments only.
    const cut = commentStart(text) ?? text.length
    const active = text.slice(0, cut)
    for (let m = re.exec(active); m; m = re.exec(active)) {
      out.push(new vscode.Range(line, m.index, line, m.index + word.length))
    }
  }
  return out
}

export function funcDocs(doc: vscode.TextDocument) {
  return getData(doc).docs
}

export function funcDecls(doc: vscode.TextDocument) {
  return getData(doc).funcs
}

export function hasFunc(doc: vscode.TextDocument, name: string) {
  return getData(doc).names.has(name)
}

export { commentStart } from "zsh-core"

function buildData(doc: vscode.TextDocument): FuncData {
  const docs = new Map<string, string>()
  const funcs: FuncDecl[] = []
  const names = new Set<string>()
  for (let line = 0; line < doc.lineCount; line++) {
    const text = doc.lineAt(line).text
    const hit = funcDeclAtLine(text)
    if (!hit) continue
    names.add(hit.name)
    const range = new vscode.Range(line, 0, line, text.length)
    const selectionRange = new vscode.Range(
      line,
      hit.start,
      line,
      hit.start + hit.name.length,
    )
    funcs.push({ name: hit.name, range, selectionRange })
    const docText =
      collectComments(doc, line - 1, -1) || collectComments(doc, line + 1, 1)
    if (docText) docs.set(hit.name, docText)
  }
  return { docs, funcs, names }
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
