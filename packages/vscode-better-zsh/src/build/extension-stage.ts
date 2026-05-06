import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { toolDefs } from "@carlwr/zsh-core-tooldef"
import { buildSettingsConfiguration } from "../settings-metadata"
import { buildLmTools } from "./lm-tools-manifest"
import { pkgDir, stagedExtensionDir } from "./paths"

const copiedEntries = [
  ".vscodeignore",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "out",
  "syntaxes",
] as const

export function stageExtension(): void {
  rmSync(stagedExtensionDir, { recursive: true, force: true })
  mkdirSync(stagedExtensionDir, { recursive: true })

  for (const entry of copiedEntries) {
    cpSync(join(pkgDir, entry), join(stagedExtensionDir, entry), {
      recursive: true,
    })
  }

  const workspacePkg = JSON.parse(
    readFileSync(join(pkgDir, "package.json"), "utf8"),
  ) as { contributes?: Record<string, unknown> } & Record<string, unknown>
  // Drop pnpm-workspace plumbing irrelevant to the published extension manifest.
  const { scripts: _s, devDependencies: _d, ...keep } = workspacePkg
  const stagedManifest = {
    ...keep,
    contributes: {
      ...(workspacePkg.contributes ?? {}),
      configuration: buildSettingsConfiguration(),
      languageModelTools: buildLmTools(toolDefs),
    },
  }
  writeFileSync(
    join(stagedExtensionDir, "package.json"),
    `${JSON.stringify(stagedManifest, null, 2)}\n`,
  )
}
