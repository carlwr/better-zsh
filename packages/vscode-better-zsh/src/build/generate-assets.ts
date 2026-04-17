import { mkdirSync, writeFileSync } from "node:fs"
import { copyRuntimeZshData } from "@carlwr/zsh-core/assets"
import { buildChatInstructions } from "./chat-instructions"
import { langConfig } from "./lang-config"
import { outDir } from "./paths"
import { buildSnippetJson, readSnippets } from "./snippets"

export async function generateAssets() {
  mkdirSync(outDir, { recursive: true })
  const snippets = readSnippets()

  writeFileSync(
    `${outDir}/language-configuration.json`,
    JSON.stringify(langConfig, null, "\t"),
  )

  writeFileSync(
    `${outDir}/snippets.json`,
    JSON.stringify(buildSnippetJson(snippets), null, "\t"),
  )

  writeFileSync(
    `${outDir}/zsh-chat-instructions.md`,
    buildChatInstructions(snippets),
  )
  copyRuntimeZshData(outDir)
}
