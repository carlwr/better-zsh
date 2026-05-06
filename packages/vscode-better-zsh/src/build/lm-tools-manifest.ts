import type { ToolDef } from "@carlwr/zsh-core-tooldef"

/** VS Code-side LM-tool display names. Keyed by `td.name`; `toolReferenceName` mirrors `td.name`. */
const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  zsh_docs: "zsh docs lookup",
  zsh_search: "Search zsh reference",
  zsh_list: "List zsh reference records",
}

export function buildLmTools(defs: readonly ToolDef[]): readonly object[] {
  return defs.map(td => {
    const displayName = DISPLAY_NAMES[td.name]
    if (!displayName) {
      throw new Error(
        `generate-assets: no VS Code LM-tool displayName for "${td.name}". ` +
          `Add an entry in DISPLAY_NAMES in lm-tools-manifest.ts.`,
      )
    }
    return {
      name: td.name,
      toolReferenceName: td.name,
      displayName,
      modelDescription: td.description,
      canBeReferencedInPrompt: true,
      tags: ["zsh"],
      inputSchema: td.inputSchema,
    }
  })
}
