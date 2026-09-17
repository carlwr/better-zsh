import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { copyRuntimeZshData } from "@carlwr/zsh-core/assets"
import { outAsset } from "../manifest"
import { buildChatInstructions } from "./chat-instructions"
import { stageExtension } from "./extension-stage"
import { langConfig } from "./lang-config"
import { outDir } from "./paths"
import { buildSnippetJson, readSnippets } from "./snippets"

export function generateAssets() {
  mkdirSync(outDir, { recursive: true })
  const snippets = readSnippets()
  const write = (name: string, content: string) =>
    writeFileSync(join(outDir, name), content)

  write(outAsset.langConfig, JSON.stringify(langConfig, null, "\t"))
  write(
    outAsset.snippets,
    JSON.stringify(buildSnippetJson(snippets), null, "\t"),
  )
  write(outAsset.chatInstructions, buildChatInstructions(snippets))
  copyRuntimeZshData(outDir)
  stageExtension()
}
