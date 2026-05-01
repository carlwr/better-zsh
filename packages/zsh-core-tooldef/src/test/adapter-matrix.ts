/**
 * Declared import surface for thin TS adapters — MCP `buildServer`, VS Code
 * `registerZshRefTools`. Enforced by `adapter-matrix.test.ts` only.
 *
 * Each adapter has its own per-row tooldef symbol allow-list, so widening
 * either side requires updating the matrix — that is the intended forcing
 * function on changes to the "thin adapter" surface.
 */

export interface ThinAdapter {
  readonly id: string
  /** Repo-relative source path */
  readonly file: string
  readonly zshCoreSymbols: ReadonlySet<string>
  readonly tooldefSymbols: ReadonlySet<string>
}

/** Corpus loader surface only; subpaths (`@carlwr/zsh-core/foo`) are forbidden. */
export const THIN_ZSH_CORE_PKG = "@carlwr/zsh-core"
/** Root package only; tooldef has no subpath consumers here. */
export const THIN_TOOLDEF_PKG = "@carlwr/zsh-core-tooldef"

const DOC_CORPUS_ONLY: ReadonlySet<string> = new Set(["DocCorpus"])

const MCP_TOOLDEF: ReadonlySet<string> = new Set([
  "TOOL_SUITE_PREAMBLE",
  "ToolDef",
  "ToolInputSchema",
  "toolDefs",
])

const LM_TOOLDEF: ReadonlySet<string> = new Set(["toolDefs"])

export const thinAdapters = [
  {
    id: "mcp-build-server",
    file: "packages/zshref-mcp/src/server/build-server.ts",
    zshCoreSymbols: DOC_CORPUS_ONLY,
    tooldefSymbols: MCP_TOOLDEF,
  },
  {
    id: "vscode-lm-adapter",
    file: "packages/vscode-better-zsh/src/lm-adapter/zsh-ref-tools.ts",
    zshCoreSymbols: DOC_CORPUS_ONLY,
    tooldefSymbols: LM_TOOLDEF,
  },
] as const satisfies readonly ThinAdapter[]

/** Named imports from `{ ... } from "..."` where `"..."` is a `@carlwr/zsh-core*` package. */
export function carlwrBraceImports(
  src: string,
): readonly { readonly names: readonly string[]; readonly module: string }[] {
  const brace =
    /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["'](@carlwr\/zsh-core[^"']*)["']/g
  const out: { names: string[]; module: string }[] = []
  for (const m of src.matchAll(brace)) {
    const inner = m[1] ?? ""
    const names = inner
      .split(",")
      .map(part => {
        const t = part.trim().replace(/^type\s+/, "")
        return (t.split(/\s+as\s+/)[0] ?? "").trim()
      })
      .filter(Boolean)
    out.push({ names, module: m[2] ?? "" })
  }
  return out
}

/** Every `from "@carlwr/..."` specifier in `src` (any import shape). */
export function carlwrFromSpecifiers(src: string): readonly string[] {
  const fromPkg = /from\s+["'](@carlwr\/[^"']+)["']/g
  const specs: string[] = []
  for (const m of src.matchAll(fromPkg)) {
    const s = m[1]
    if (s !== undefined) specs.push(s)
  }
  return specs
}
