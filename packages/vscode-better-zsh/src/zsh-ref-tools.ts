import { toolDefs } from "@carlwr/zsh-ref-mcp"
import * as vscode from "vscode"
import type { DocCorpus } from "zsh-core"

/**
 * Register the `@carlwr/zsh-ref-mcp` tool set as VS Code Language Model tools.
 *
 * The extension shares the pure tool implementations with the standalone MCP
 * server — both adapters route JSON arguments through the same
 * `(corpus, input) → output` pipeline. The extension-side adapter constructs
 * `LanguageModelToolResult` instances; the MCP-side adapter produces JSON-RPC
 * `content` frames. Nothing in this file spawns a process or reads env.
 *
 * Tool `name` values must match entries in `contributes.languageModelTools`
 * in `package.json`; a unit test guards the one-to-one correspondence.
 */
export function registerZshRefTools(
  ctx: vscode.ExtensionContext,
  corpus: DocCorpus,
): void {
  for (const def of toolDefs) {
    ctx.subscriptions.push(
      vscode.lm.registerTool(def.name, {
        invoke: opts => {
          const input = (opts.input ?? {}) as Readonly<Record<string, unknown>>
          const result = def.execute(corpus, input)
          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2)),
          ])
        },
      }),
    )
  }
}
