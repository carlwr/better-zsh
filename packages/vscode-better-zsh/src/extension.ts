import { loadLexicon } from "@carlwr/zsh-lexicon"
import { PKG_VERSION, ZSH_UPSTREAM } from "@carlwr/zsh-lexicon/meta"
import type * as vscode from "vscode"
import { contribute } from "./contributions"
import { initLog, log } from "./log"

export function activate(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(initLog())
  const { name, version = "unknown" } = ctx.extension.packageJSON
  log(
    `${name} ${version} | zsh-lexicon ${PKG_VERSION} | ${ZSH_UPSTREAM.tag} (${ZSH_UPSTREAM.commit.slice(0, 7)})`,
  )
  // Reference knowledge is bundled, each doc category parsed on first use;
  // the host zsh is only spawned for what needs a zsh: the syntax check.
  contribute(ctx, loadLexicon())
}
