import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { ToolDef } from "./tool-defs.ts"

/**
 * Metadata-only projection of a `ToolDef` — the `execute` function is
 * intentionally dropped (it is not serialisable). Descriptions are already
 * flow prose in `tool-defs.ts` and pass through unchanged; clap handles
 * terminal-width wrapping at render time.
 */
export interface ToolDefJson {
  readonly name: string
  readonly brief: string
  readonly description: string
  readonly flagBriefs: Readonly<Record<string, string>>
  readonly inputSchema: Readonly<Record<string, unknown>>
}

export interface ToolDefsJson {
  readonly version: 1
  readonly tools: readonly ToolDefJson[]
  /**
   * Suite-level intent→tool cheat-sheet. The Rust CLI renders this into
   * `zshref --help` after tool-name rewriting; the MCP adapter passes it
   * as server `instructions`. See `TOOL_SUITE_PREAMBLE` in
   * `src/tool-defs.ts` for the drift warning that governs edits.
   */
  readonly preamble: string
}

function projectToolDef(td: ToolDef): ToolDefJson {
  return {
    name: td.name,
    brief: td.brief,
    description: td.description,
    flagBriefs: td.flagBriefs,
    inputSchema: td.inputSchema,
  }
}

function fmtJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`
}

/**
 * Write `tooldef.json` + `tooldef.schema.json` under `outDir`. Intended to
 * be invoked from `build.ts` after `tsup` has produced the JS bundle.
 *
 * Consumer: the Rust CLI (`zshref-rs`) which bundles this file via
 * `include_bytes!`. TS consumers (MCP, vscode) keep reading the `toolDefs`
 * const in-process and never touch this artifact.
 */
export function writeToolDefsJson(
  toolDefs: readonly ToolDef[],
  preamble: string,
  outDir: string,
): void {
  mkdirSync(outDir, { recursive: true })
  const payload: ToolDefsJson = {
    version: 1,
    tools: toolDefs.map(projectToolDef),
    preamble,
  }
  writeFileSync(join(outDir, "tooldef.json"), fmtJson(payload), "utf8")
  writeFileSync(
    join(outDir, "tooldef.schema.json"),
    fmtJson(toolDefsJsonSchema),
    "utf8",
  )
}

/**
 * Hand-written JSON Schema for `tooldef.json`. The shape is small and
 * stable; a generator round-trip would add a devDep and a build step for
 * no observable benefit here. When the Rust-side `serde` struct is the
 * real source of truth, this schema stays as a human-facing reference.
 */
const toolDefsJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "ToolDefsJson",
  type: "object",
  required: ["version", "tools", "preamble"],
  additionalProperties: false,
  properties: {
    version: { const: 1 },
    tools: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "brief", "description", "flagBriefs", "inputSchema"],
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          brief: { type: "string" },
          description: { type: "string" },
          flagBriefs: {
            type: "object",
            additionalProperties: { type: "string" },
          },
          inputSchema: {
            type: "object",
            description: "Embedded JSON Schema for this tool's input.",
          },
        },
      },
    },
    preamble: {
      type: "string",
      description:
        "Suite-level intent→tool cheat-sheet, rendered into CLI --help and MCP server instructions.",
    },
  },
} as const
