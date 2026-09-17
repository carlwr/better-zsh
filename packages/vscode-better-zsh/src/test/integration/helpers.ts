import * as assert from "node:assert"
import { execFileSync } from "node:child_process"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { cached } from "@carlwr/typescript-extra"
import { rm_rf } from "@carlwr/typescript-extra/node"
import * as vscode from "vscode"
import { ZSH_DIAGNOSTIC_SOURCE, ZSH_LANG_ID } from "../../ids"

/** The package dir: compiled suites sit at `<pkg>/.vscode-test/test/<suite>/`. */
export const pkgDir = path.resolve(__dirname, "../../..")
const fixtureDir = path.join(pkgDir, "test-fixtures")

export const hasZsh = cached(() => {
  try {
    execFileSync("zsh", ["--version"])
    return true
  } catch {
    return false
  }
})

/** Show `doc`, then give providers `delay` ms to settle. */
async function shown(doc: vscode.TextDocument, delay: number) {
  await vscode.window.showTextDocument(doc)
  await new Promise(r => setTimeout(r, delay))
  return doc
}

export const openFixture = async (name: string, delay = 500) =>
  shown(
    await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.join(fixtureDir, name)),
    ),
    delay,
  )

export const openText = async (text: string, delay = 500) =>
  shown(
    await vscode.workspace.openTextDocument({
      language: ZSH_LANG_ID,
      content: text,
    }),
    delay,
  )

export async function completionLabels(
  doc: vscode.TextDocument,
  pos: vscode.Position,
) {
  const items = await vscode.commands.executeCommand<vscode.CompletionList>(
    "vscode.executeCompletionItemProvider",
    doc.uri,
    pos,
  )
  assert.ok(items, "expected completion result")
  return items.items.map(i =>
    typeof i.label === "string" ? i.label : i.label.label,
  )
}

export async function hoverText(
  doc: vscode.TextDocument,
  pos: vscode.Position,
) {
  const hovers =
    (await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      doc.uri,
      pos,
    )) ?? []
  assert.ok(hovers.length > 0, "expected hover")
  return hovers
    .flatMap(h => h.contents)
    .map(c => (typeof c === "string" ? c : (c as { value: string }).value))
    .join("\n\n")
}

/** The texts under the document highlights at `pos`, sorted. */
export async function highlightTexts(
  doc: vscode.TextDocument,
  pos: vscode.Position,
) {
  const hl = await vscode.commands.executeCommand<vscode.DocumentHighlight[]>(
    "vscode.executeDocumentHighlights",
    doc.uri,
    pos,
  )
  assert.ok(hl, "expected highlights")
  return rangeTexts(doc, hl)
}

/** The text under each range, sorted. */
export const rangeTexts = (
  doc: vscode.TextDocument,
  ranges: readonly { range: vscode.Range }[],
) => ranges.map(({ range }) => doc.getText(range)).sort()

export function zshDiagnostics(uri: vscode.Uri) {
  return vscode.languages
    .getDiagnostics(uri)
    .filter(d => d.source === ZSH_DIAGNOSTIC_SOURCE)
}

export async function waitForDiagnostics(
  uri: vscode.Uri,
  want: "some" | "none",
  timeout = 6000,
  stable = 500,
) {
  const start = Date.now()
  let clearSince: number | undefined
  while (Date.now() - start < timeout) {
    const diags = zshDiagnostics(uri)
    if (want === "some" && diags.length > 0) return diags
    if (want === "none" && diags.length === 0) {
      clearSince ??= Date.now()
      if (Date.now() - clearSince >= stable) return diags
    } else {
      clearSince = undefined
    }
    await new Promise(r => setTimeout(r, 100))
  }
  return zshDiagnostics(uri)
}

export async function withBadZdotdir<T>(f: () => Promise<T>): Promise<T> {
  const prev = process.env.ZDOTDIR
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "better-zsh-zdotdir."))
  await fs.writeFile(
    path.join(dir, ".zshenv"),
    "print -u2 sourced-dotfile\nexit 7\n",
  )
  process.env.ZDOTDIR = dir
  try {
    return await f()
  } finally {
    if (prev === undefined) delete process.env.ZDOTDIR
    else process.env.ZDOTDIR = prev
    await rm_rf(dir)
  }
}
