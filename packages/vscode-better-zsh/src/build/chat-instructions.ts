import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { ZshSnippet } from "../types/snippet"

const bashDiffsPath = join("src", "assets", "zsh", "bash-differences.md")

function readBashDiffsMd(): string {
  return readFileSync(bashDiffsPath, "utf8").trimEnd()
}

export function buildChatInstructions(snippets: readonly ZshSnippet[]): string {
  const snippetList = snippets
    .map((s) => `- \`${s.prefix}\` — ${s.desc}`)
    .join("\n")

  return `# Zsh — Key Differences from Bash

${readBashDiffsMd()}

## Available Snippets

${snippetList}
`
}
