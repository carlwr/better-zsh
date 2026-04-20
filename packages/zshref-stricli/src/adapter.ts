/**
 * Stricli adapter: same contract as `@carlwr/zshref`'s cliffy adapter, but
 * built on Bloomberg's `@stricli/core`. Walks `toolDefs` and exposes each as
 * a subcommand under a shared route map.
 *
 * Experiment goal: compare how stricli renders --help (wrapping, column
 * handling, description blocks) against cliffy, using the same toolDefs.
 */

import type { DocCorpus } from "@carlwr/zsh-core"
import { docCategories } from "@carlwr/zsh-core"
import type { ToolDef, ToolInputSchema } from "@carlwr/zsh-core-tooldef"
import {
  type Application,
  type CommandContext,
  buildApplication,
  buildCommand,
  buildRouteMap,
  numberParser,
} from "@stricli/core"

export interface BuildAppOpts {
  readonly corpus: DocCorpus
  readonly toolDefs: readonly ToolDef[]
  readonly name: string
  readonly version: string
}

interface JsonSchemaProp {
  readonly type?: string
  readonly description?: string
  readonly minimum?: number
  readonly maximum?: number
}

interface JsonSchema {
  readonly properties?: Readonly<Record<string, JsonSchemaProp>>
  readonly required?: readonly string[]
}

const CATEGORY_PROP = "category"

export function subcommandName(toolName: string): string {
  return toolName.replace(/^zsh_/, "").toLowerCase()
}

export function buildApp(opts: BuildAppOpts): Application<CommandContext> {
  const routes: Record<string, ReturnType<typeof buildCommand>> = {}

  for (const td of opts.toolDefs) {
    routes[subcommandName(td.name)] = buildSubcommand(opts.corpus, td)
  }

  const root = buildRouteMap({
    routes,
    docs: {
      brief:
        "Query the static zsh reference from the command line — JSON on stdout, pipe-friendly.",
    },
  })

  return buildApplication(root, {
    name: opts.name,
    versionInfo: { currentVersion: opts.version },
  })
}

function buildSubcommand(
  corpus: DocCorpus,
  td: ToolDef,
): ReturnType<typeof buildCommand> {
  const schema = td.inputSchema as JsonSchema
  const props = schema.properties ?? {}
  const required = new Set(schema.required ?? [])

  const flags: Record<string, unknown> = {}
  for (const [key, spec] of Object.entries(props)) {
    flags[key] = makeFlagSpec(key, spec, required.has(key))
  }

  return buildCommand({
    parameters: {
      // biome-ignore lint/suspicious/noExplicitAny: dynamic construction from JSON Schema, types land in the tool's execute signature
      flags: flags as any,
    },
    docs: {
      brief: td.description,
    },
    func: async function (this: CommandContext, parsedFlags) {
      const input = parsedFlags as unknown as ToolInputSchema
      try {
        const result = td.execute(corpus, input)
        this.process.stdout.write(`${JSON.stringify(result)}\n`)
      } catch (err) {
        this.process.stderr.write(
          `${err instanceof Error ? err.message : String(err)}\n`,
        )
        throw err
      }
    },
  })
}

function makeFlagSpec(
  key: string,
  spec: JsonSchemaProp,
  isRequired: boolean,
): unknown {
  const brief = spec.description ?? ""
  if (key === CATEGORY_PROP) {
    return {
      kind: "enum",
      values: [...docCategories],
      brief,
      optional: !isRequired,
    }
  }
  if (spec.type === "integer" || spec.type === "number") {
    return {
      kind: "parsed",
      parse: numberParser,
      brief,
      optional: !isRequired,
    }
  }
  return {
    kind: "parsed",
    parse: (s: string) => s,
    brief,
    optional: !isRequired,
  }
}
