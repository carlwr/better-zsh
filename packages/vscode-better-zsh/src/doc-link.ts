import { existsSync } from "node:fs"
import { dirname, isAbsolute, join } from "node:path"
import * as vscode from "vscode"
import { commentStart } from "zsh-core"

// Matches: source <path> or . <path> (at command position)
const SOURCE_RE = /(?:^|\s)(?:source|\.)\s+(\S+)/g

export class DocLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(doc: vscode.TextDocument): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = []
    const docDir = dirname(doc.uri.fsPath)

    for (let i = 0; i < doc.lineCount; i++) {
      const text = doc.lineAt(i).text
      const cut = commentStart(text) ?? text.length
      const active = text.slice(0, cut)

      for (const match of active.matchAll(SOURCE_RE)) {
        const pathStr = match[1]
        if (!pathStr) continue

        // Skip variable-only paths ($VAR, ${VAR})
        if (/^\$/.test(pathStr)) continue

        const resolved = isAbsolute(pathStr) ? pathStr : join(docDir, pathStr)

        if (!existsSync(resolved)) continue

        const start = text.indexOf(pathStr, match.index)
        if (start === -1) continue

        const range = new vscode.Range(i, start, i, start + pathStr.length)
        const uri = vscode.Uri.file(resolved)
        links.push(new vscode.DocumentLink(range, uri))
      }
    }
    return links
  }
}

/** Pure function: extract source/. path tokens from a line (for testing) */
export function extractSourcePaths(
  line: string,
): { path: string; start: number }[] {
  const cut = commentStart(line) ?? line.length
  const active = line.slice(0, cut)
  const out: { path: string; start: number }[] = []
  for (const match of active.matchAll(SOURCE_RE)) {
    const p = match[1]
    if (!p || /^\$/.test(p)) continue
    const start = line.indexOf(p, match.index)
    if (start !== -1) out.push({ path: p, start })
  }
  return out
}
