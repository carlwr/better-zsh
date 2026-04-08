import { execFileSync } from "node:child_process"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import * as vscode from "vscode"
import { ZSH_LANG_ID } from "../../ids"

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
  await new Promise((r) => setTimeout(r, delay))
  return doc
}

async function openDoc(uri: vscode.Uri, delay: number) {
  const doc = await vscode.workspace.openTextDocument(uri)
  await vscode.window.showTextDocument(doc)
  await new Promise((r) => setTimeout(r, delay))
  return doc
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
