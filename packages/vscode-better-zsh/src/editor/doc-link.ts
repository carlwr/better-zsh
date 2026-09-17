import { existsSync } from "node:fs"
import { dirname, isAbsolute, join } from "node:path"
import * as vscode from "vscode"
import { activeText } from "../document/words"

// `source <path>` / `. <path>` wherever a word starts — not only at command
// position; the operand is a quoted string or a word up to shell punctuation.
const SOURCE_RE = /(?:^|\s)(?:source|\.)\s+("[^"]*"|'[^']*'|[^\s;|&()<>"']+)/g

export interface SourcePath {
  readonly path: string
  /** Column of `path` on its line. */
  readonly start: number
}

// A `//` or `\\` prefix names a network share on Windows, and probing one
// opens a connection (an SMB request carries credentials) — from a path the
// file dictates. Not a loss on POSIX: `//x` is `/x`, and `\\x` is an escape.
const NETWORK_PATH = /^(\/\/|\\\\)/

/** `source`/`.` path operands of a line: literal, local ones only — `$`-leading and network paths are skipped, not expanded; quotes are stripped. */
export function extractSourcePaths(line: string): SourcePath[] {
  const out: SourcePath[] = []
  for (const m of activeText(line).matchAll(SOURCE_RE)) {
    const operand = m[1] ?? ""
    const end = m.index + m[0].length
    const quoted = operand.match(/^(["'])(.*)\1$/)
    const path = quoted?.[2] ?? operand
    if (!path || path.startsWith("$") || NETWORK_PATH.test(path)) continue
    out.push({ path, start: end - operand.length + (quoted ? 1 : 0) })
  }
  return out
}

export class DocLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(doc: vscode.TextDocument): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = []
    if (doc.uri.scheme !== "file") return links
    const docDir = dirname(doc.uri.fsPath)
    for (let line = 0; line < doc.lineCount; line++) {
      for (const { path, start } of extractSourcePaths(doc.lineAt(line).text)) {
        const resolved = isAbsolute(path) ? path : join(docDir, path)
        if (!existsSync(resolved)) continue
        const range = new vscode.Range(line, start, line, start + path.length)
        links.push(new vscode.DocumentLink(range, vscode.Uri.file(resolved)))
      }
    }
    return links
  }
}
