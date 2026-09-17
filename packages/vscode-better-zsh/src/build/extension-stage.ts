import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { BETTER_ZSH_DISPLAY_NAME } from "../ids"
import { manifest } from "../manifest"
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
  ) as Record<string, unknown>
  // Drop pnpm-workspace plumbing irrelevant to the published extension manifest.
  const {
    scripts: _s,
    dependencies: _d,
    devDependencies: _dd,
    ...keep
  } = workspacePkg
  const stagedManifest = {
    ...keep,
    displayName: BETTER_ZSH_DISPLAY_NAME,
    ...manifest,
  }
  writeFileSync(
    join(stagedExtensionDir, "package.json"),
    `${JSON.stringify(stagedManifest, null, 2)}\n`,
  )
}
