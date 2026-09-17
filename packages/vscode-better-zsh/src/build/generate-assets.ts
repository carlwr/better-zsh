import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { copyRuntimeZshData } from "@carlwr/zsh-core/assets"
import { type OutAsset, outAsset } from "../manifest"
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

/** The instructions markdown, then a section listing every snippet. */
export const buildChatInstructions = (
  md: string,
  snippets: readonly ZshSnippet[],
) => `\
${md.trimEnd()}

## Available Snippets

${snippets.map(s => `- \`${s.prefix}\` — ${s.desc}`).join("\n")}
`

const json = (value: unknown) => JSON.stringify(value, null, "\t")

export function generateAssets() {
  mkdirSync(outDir, { recursive: true })
  // Keyed by the manifest's asset table: an asset without content is a type error.
  const content: Record<OutAsset, string> = {
    langConfig: json(langConfig),
    snippets: json(toVsCodeSnippets(snippets)),
    chatInstructions: buildChatInstructions(
      readFileSync(chatInstructionsMd, "utf8"),
      snippets,
    ),
  }
  for (const asset of Object.keys(outAsset) as OutAsset[])
    writeFileSync(join(outDir, outAsset[asset]), content[asset])
  copyRuntimeZshData(outDir)
}
