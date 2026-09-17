import { loadCorpus } from "@carlwr/zsh-core"
import { PKG_VERSION, ZSH_UPSTREAM } from "@carlwr/zsh-core/meta"
import type * as vscode from "vscode"
import { contribute } from "./contributions"
import { initLog, log } from "./log"

export function activate(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(initLog())
  const extVersion = ctx.extension.packageJSON.version ?? "unknown"
  log(
    `better-zsh ${extVersion} | zsh-core ${PKG_VERSION} | ${ZSH_UPSTREAM.tag} (${ZSH_UPSTREAM.commit.slice(0, 7)})`,
  )
  // Reference knowledge is bundled and ready at once; the host zsh is only
  // spawned for what needs a zsh: the syntax check.
  contribute(ctx, loadCorpus())
}
