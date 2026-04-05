import { cpSync, mkdirSync, writeFileSync } from "node:fs"
import { buildChatInstructions } from "./chat-instructions"
import { langConfig } from "./lang-config"
import { buildSnippetJson, readSnippets } from "./snippets"

export async function generateAssets() {
  mkdirSync("out", { recursive: true })
  const snippets = readSnippets()

  writeFileSync(
    "out/language-configuration.json",
    JSON.stringify(langConfig, null, "\t"),
  )

  writeFileSync(
    "out/snippets.json",
    JSON.stringify(buildSnippetJson(snippets), null, "\t"),
  )

  writeFileSync("out/zsh-chat-instructions.md", buildChatInstructions(snippets))
  cpSync("../zsh-core/src/data/zsh-docs", "out/zsh-core-data", {
    recursive: true,
  })
}
