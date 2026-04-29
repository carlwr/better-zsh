/**
 * Generates the `contributes.languageModelTools` block in the extension's
 * `package.json` from `toolDefs`. The block is a CHECKED-IN GENERATED
 * artifact — `vsce` reads `package.json` directly and VS Code requires
 * `contributes` to be inline, so it has to physically live there.
 *
 * Contract:
 *   - DON'T hand-edit `contributes.languageModelTools`.
 *   - Rebuild the extension after editing any tooldef before committing
 *     (`pnpm --filter better-zsh build` runs the codegen).
 *   - The drift test in `src/test/zsh-ref-tools.test.ts` compares the
 *     committed manifest to `buildLmTools(toolDefs)`; a stale manifest
 *     fails it.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { type ToolDef, toolDefs } from "@carlwr/zsh-core-tooldef"
import { pkgDir } from "./paths"

interface VscodeFields {
  readonly toolReferenceName: string
  readonly displayName: string
}

/** VS Code-side LM-tool fields not in `ToolDef`. Keyed by `td.name`. */
const VSCODE_FIELDS: Readonly<Record<string, VscodeFields>> = {
  zsh_docs: { toolReferenceName: "zshDocs", displayName: "zsh docs lookup" },
  zsh_search: {
    toolReferenceName: "zshSearch",
    displayName: "Search zsh reference",
  },
  zsh_list: {
    toolReferenceName: "zshList",
    displayName: "List zsh reference records",
  },
}

export function buildLmTools(defs: readonly ToolDef[]): readonly object[] {
  return defs.map(td => {
    const ext = VSCODE_FIELDS[td.name]
    if (!ext) {
      throw new Error(
        `generate-assets: no VS Code LM-tool fields for "${td.name}". ` +
          `Add an entry in VSCODE_FIELDS in lm-tools-manifest.ts.`,
      )
    }
    return {
      name: td.name,
      toolReferenceName: ext.toolReferenceName,
      displayName: ext.displayName,
      modelDescription: td.description,
      canBeReferencedInPrompt: true,
      tags: ["zsh"],
      inputSchema: td.inputSchema,
    }
  })
}

/**
 * Regenerate `contributes.languageModelTools` in the extension's
 * `package.json` from `toolDefs`. Committed for VSIX packaging; this writer
 * is the source of truth.
 */
export function writeLanguageModelTools(): void {
  const path = join(pkgDir, "package.json")
  const pkg = JSON.parse(readFileSync(path, "utf8")) as {
    contributes?: Record<string, unknown>
  } & Record<string, unknown>
  pkg.contributes = {
    ...(pkg.contributes ?? {}),
    languageModelTools: buildLmTools(toolDefs),
  }
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`)
}
