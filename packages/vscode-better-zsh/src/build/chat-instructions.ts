import { readFileSync } from "node:fs"
import type { ZshSnippet } from "../types/snippet"
import { bashDiffsPath } from "./paths"

function readBashDiffsMd(): string {
  return readFileSync(bashDiffsPath, "utf8").trimEnd()
}

export function buildChatInstructions(snippets: readonly ZshSnippet[]): string {
  const snippetList = snippets
    .map(s => `- \`${s.prefix}\` — ${s.desc}`)
    .join("\n")

  return `# Zsh — Key Differences from Bash

${readBashDiffsMd()}

## Available Snippets

${snippetList}
`
}
