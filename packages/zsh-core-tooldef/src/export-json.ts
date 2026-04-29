import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { ToolDef } from "./tool-defs.ts"

/**
 * Metadata-only projection of a `ToolDef` — `execute` is omitted (not
 * serialisable). Descriptions pass through unchanged; the Rust CLI wraps
 * help text at render time.
 */
export interface ToolDefJson {
  readonly name: string
  readonly brief: string
  readonly description: string
  readonly flagBriefs: Readonly<Record<string, string>>
  readonly inputSchema: Readonly<Record<string, unknown>>
  readonly outputSchema: Readonly<Record<string, unknown>>
}

export interface ToolDefsJson {
  readonly version: 1
  readonly tools: readonly ToolDefJson[]
  /**
   * Suite-level intent→tool cheat-sheet. The Rust CLI renders this after
   * tool-name rewriting; MCP passes it as server `instructions`. Editing
   * constraints match `TOOL_SUITE_PREAMBLE` in `tool-defs.ts`.
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
    outputSchema: td.outputSchema,
  }
}

function fmtJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`
}

export function toolDefsJsonPayload(
  toolDefs: readonly ToolDef[],
  preamble: string,
): ToolDefsJson {
  return {
    version: 1,
    tools: toolDefs.map(projectToolDef),
    preamble,
  }
}

export function fmtToolDefsJson(
  toolDefs: readonly ToolDef[],
  preamble: string,
): string {
  return fmtJson(toolDefsJsonPayload(toolDefs, preamble))
}

/**
 * Write `tooldef.json` + `tooldef.schema.json` under `outDir`. Invoked from
 * `build.ts` after `tsup` emits the bundle.
 *
 * The Rust CLI embeds `tooldef.json`; TypeScript adapters use in-memory
 * `toolDefs` and normally skip this artifact.
 */
export function writeToolDefsJson(
  toolDefs: readonly ToolDef[],
  preamble: string,
  outDir: string,
): void {
  mkdirSync(outDir, { recursive: true })
  writeFileSync(
    join(outDir, "tooldef.json"),
    fmtToolDefsJson(toolDefs, preamble),
    "utf8",
  )
  writeFileSync(
    join(outDir, "tooldef.schema.json"),
    fmtJson(toolDefsJsonSchema),
    "utf8",
  )
}

/**
 * Hand-written JSON Schema for `tooldef.json`. The shape is small and
 * stable; a generator round-trip would add a devDep and a build step for
 * little gain.
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
        required: [
          "name",
          "brief",
          "description",
          "flagBriefs",
          "inputSchema",
          "outputSchema",
        ],
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
          outputSchema: {
            type: "object",
            description: "Embedded JSON Schema for this tool's output.",
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
