import { loadCorpus } from "@carlwr/zsh-core"
import { PKG_VERSION, ZSH_UPSTREAM } from "@carlwr/zsh-core/meta"
import type * as vscode from "vscode"
import { contribute } from "./contributions"
import { initLog, log } from "./log"
import { readZshPathConfig } from "./settings"
import { configureZsh } from "./zsh"

export function activate(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(initLog())
  const extVersion = ctx.extension.packageJSON.version ?? "unknown"
  log(
    `better-zsh ${extVersion} | zsh-core ${PKG_VERSION} | ${ZSH_UPSTREAM.tag} (${ZSH_UPSTREAM.commit.slice(0, 7)})`,
  )
  configureZsh(readZshPathConfig())
  // Reference knowledge is bundled and ready at once; host zsh is only
  // spawned where execution is intrinsic (diagnostics, tokenization).
  contribute(ctx, loadCorpus())
}
