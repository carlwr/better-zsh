import type { ToolDef } from "@carlwr/zsh-core-tooldef"

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
