import * as vscode from "vscode"
import { BETTER_ZSH_DISPLAY_NAME } from "./ids"

const RECENT_MAX = 200

let ch: vscode.LogOutputChannel | undefined
const recent: string[] = []

function emit(level: "info" | "warn") {
  return (msg: string) => {
    recent.push(`${level}: ${msg}`)
    if (recent.length > RECENT_MAX) recent.shift()
    ch?.[level](msg)
  }
}

export function initLog() {
  ch = vscode.window.createOutputChannel(BETTER_ZSH_DISPLAY_NAME, { log: true })
  return ch
}

export const log = emit("info")
export const warn = emit("warn")

/** The last few hundred log lines; for test hooks. */
export function recentLogs() {
  return [...recent]
}
