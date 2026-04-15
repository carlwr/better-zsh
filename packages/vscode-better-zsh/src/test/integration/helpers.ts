import * as assert from "node:assert"
import { execFileSync } from "node:child_process"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import * as vscode from "vscode"
import { ZSH_DIAGNOSTIC_SOURCE, ZSH_LANG_ID } from "../../ids"

const fixtureDir = path.resolve(__dirname, "../../../test-fixtures")

export function hasZsh(): boolean {
  try {
    execFileSync("zsh", ["--version"])
    return true
  } catch {
    return false
  }
}

export async function openFixture(name: string, delay = 500) {
  const uri = vscode.Uri.file(path.join(fixtureDir, name))
  return openDoc(uri, delay)
}

export async function openText(text: string, delay = 500) {
  const doc = await vscode.workspace.openTextDocument({
    language: ZSH_LANG_ID,
    content: text,
  })
  await vscode.window.showTextDocument(doc)
  await new Promise(r => setTimeout(r, delay))
  return doc
}

async function openDoc(uri: vscode.Uri, delay: number) {
  const doc = await vscode.workspace.openTextDocument(uri)
  await vscode.window.showTextDocument(doc)
  await new Promise(r => setTimeout(r, delay))
  return doc
}

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
    await fs.rm(dir, { recursive: true, force: true })
  }
}
