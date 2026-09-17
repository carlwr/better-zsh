import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { copyRuntimeZshData } from "@carlwr/zsh-core/assets"
import { type OutAsset, outAsset } from "../manifest"
import {
  type ChatInstructionsMeta,
  chatInstructionsMeta,
} from "../manifest/chat-instructions"
import { langConfig } from "../manifest/lang-config"
import { snippets, type ZshSnippet } from "../manifest/snippets"
import { chatInstructionsMd, outDir } from "./paths"

/** VS Code's snippet file format, keyed by snippet name. */
export type VsCodeSnippets = Record<
  string,
  { prefix: string; body: readonly string[]; description: string }
>

export const toVsCodeSnippets = (
  snippets: readonly ZshSnippet[],
): VsCodeSnippets =>
  Object.fromEntries(
    snippets.map(s => [
      s.name,
      { prefix: s.prefix, body: s.body, description: s.desc },
    ]),
  )

// JSON strings are valid YAML double-quoted scalars: no quoting rules to get wrong.
const frontmatter = (meta: ChatInstructionsMeta) =>
  Object.entries(meta)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n")

// The file is injected into chats: what a reader sees must be all there is.
// Refused, never converted — the source is the place to fix.
const NOT_PRINTABLE_ASCII = /[^\x20-\x7E\n]/
function assertPrintableAscii(text: string): string {
  const at = text.search(NOT_PRINTABLE_ASCII)
  if (at < 0) return text
  const line = text.slice(0, at).split("\n").length
  const char = text.charCodeAt(at).toString(16).padStart(4, "0")
  throw new Error(`chat instructions: non-ASCII U+${char} on line ${line}`)
}

/** Frontmatter, the instructions markdown, then a section listing every snippet; printable ASCII only, or throws. */
export const buildChatInstructions = (
  meta: ChatInstructionsMeta,
  md: string,
  snippets: readonly ZshSnippet[],
) =>
  assertPrintableAscii(`\
---
${frontmatter(meta)}
---

${md.trimEnd()}

## Available Snippets

${snippets.map(s => `- \`${s.prefix}\` - ${s.desc}`).join("\n")}
`)

const json = (value: unknown) => JSON.stringify(value, null, "\t")

export function generateAssets() {
  mkdirSync(outDir, { recursive: true })
  // Keyed by the manifest's asset table: an asset without content is a type error.
  const content: Record<OutAsset, string> = {
    langConfig: json(langConfig),
    snippets: json(toVsCodeSnippets(snippets)),
    chatInstructions: buildChatInstructions(
      chatInstructionsMeta,
      readFileSync(chatInstructionsMd, "utf8"),
      snippets,
    ),
  }
  for (const asset of Object.keys(outAsset) as OutAsset[])
    writeFileSync(join(outDir, outAsset[asset]), content[asset])
  copyRuntimeZshData(outDir)
}
