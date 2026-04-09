import * as vscode from "vscode"

let ch: vscode.LogOutputChannel | undefined
const recent: string[] = []

function remember(level: string, msg: string) {
  recent.push(`${level}: ${msg}`)
  if (recent.length > 200) recent.shift()
}

export function initLog() {
  ch = vscode.window.createOutputChannel("Better Zsh", { log: true })
  return ch
}

export function log(msg: string) {
  remember("info", msg)
  ch?.info(msg)
}

export function warn(msg: string) {
  remember("warn", msg)
  ch?.warn(msg)
}

export function recentLogs() {
  return [...recent]
}
