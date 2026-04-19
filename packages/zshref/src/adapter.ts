/**
 * Cliffy tree builder: walks `ToolDef`s and exposes each as a subcommand.
 *
 * Subcommand name = `ToolDef.name` with the `zsh_` prefix stripped — the
 * root bin already scopes under `zshref`, so the redundant prefix costs
 * typing without adding discrimination. Shortened names (classify, search,
 * describe, lookup_option) read naturally under `zshref <sub>`.
 *
 * Exit codes: 0 on any well-formed invocation (incl. empty matches); 2 on
 * bad input (cliffy ValidationError — unknown enum, missing required flag,
 * type mismatch); 1 on unexpected errors thrown by `tool.execute`.
 */

import type { DocCorpus } from "@carlwr/zsh-core"
import { docCategories } from "@carlwr/zsh-core"
import type { ToolDef, ToolInputSchema } from "@carlwr/zsh-core-tooldef"
import { Command, EnumType, ValidationError } from "@cliffy/command"
import { CompletionsCommand } from "@cliffy/command/completions"

export interface BuildCliOpts {
  readonly corpus: DocCorpus
  readonly toolDefs: readonly ToolDef[]
  readonly name: string
  readonly version: string
  readonly stdout?: NodeJS.WritableStream
  readonly stderr?: NodeJS.WritableStream
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

export function buildCli(opts: BuildCliOpts): Command {
  const stdout = opts.stdout ?? process.stdout
  const stderr = opts.stderr ?? process.stderr

  const root = new Command()
    .name(opts.name)
    .version(opts.version)
    .description(
      "Query the static zsh reference from the command line — JSON on stdout, pipe-friendly.",
    )
    // Suppress the auto-generated hints column (Values: ..., required) — the
    // enum values and required markers are already documented in option
    // descriptions, so the hints column only adds line-length overflow.
    .help({ hints: false })
    // Route cliffy's own error output (ValidationError / missing required /
    // unknown option) via `throwErrors: true` so we can map to exit code 2.
    .throwErrors()

  const categoryType = new EnumType([...docCategories])

  for (const td of opts.toolDefs) {
    const schema = td.inputSchema as JsonSchema
    const props = schema.properties ?? {}
    const required = new Set(schema.required ?? [])

    const sub = new Command()
      .name(subcommandName(td.name))
      .description(td.description)
      .usage(buildUsage(props, required))
      .type(CATEGORY_PROP, categoryType, { global: false })

    for (const [key, spec] of Object.entries(props)) {
      const flag = propertyToOption(key, spec, required.has(key))
      sub.option(flag.flagSpec, flag.desc)
    }

    sub.action(rawOpts => {
      const input = rawOpts as unknown as ToolInputSchema
      let result: unknown
      try {
        result = td.execute(opts.corpus, input)
      } catch (err) {
        stderr.write(
          `${opts.name}: ${err instanceof Error ? err.message : String(err)}\n`,
        )
        process.exit(1)
      }
      stdout.write(`${JSON.stringify(result)}\n`)
    })

    root.command(subcommandName(td.name), sub)
  }

  root.command("completions", new CompletionsCommand())

  return root
}

interface OptionSpec {
  readonly flagSpec: string
  readonly desc: string
}

function propertyToOption(
  key: string,
  spec: JsonSchemaProp,
  isRequired: boolean,
): OptionSpec {
  const flag = `--${key}`
  const typeTag = cliffyTypeFor(key, spec.type)
  const placeholder = isRequired ? `<${key}:${typeTag}>` : `[${key}:${typeTag}]`
  // cliffy attaches `.required()` via a trailing marker in the flag spec
  // ONLY via the builder method; we instead append a space then the
  // placeholder and set `required: true` via chained call — simpler is
  // to bake it into the spec string.
  const suffix = isRequired ? " (required)" : ""
  return {
    flagSpec: `${flag} ${placeholder}`,
    desc: `${spec.description ?? ""}${suffix}`,
  }
}

/**
 * Build a compact usage synopsis for a subcommand, e.g.:
 *   --raw RAW  [--category CATEGORY] [--limit LIMIT]
 *
 * Required flags are bare; optional are wrapped in `[...]`.  Note: the usage
 * string is passed through cliffy's `highlightArguments()` which treats
 * space-separated tokens starting+ending with `[`/`]` or `<`/`>` as
 * positional-argument tokens (and colorizes them).  We deliberately keep each
 * `[--flag VALUE]` as a single bracket-wrapped token so cliffy treats the
 * entire token (flag + placeholder) as one highlighted argument, which
 * produces readable output without un-parseable fragments.
 */
function buildUsage(
  props: Readonly<Record<string, JsonSchemaProp>>,
  required: ReadonlySet<string>,
): string {
  return Object.keys(props)
    .map(key => {
      const bare = `--${key}`
      return required.has(key) ? bare : `[${bare}]`
    })
    .join(" ")
}

// The `category` property uses cliffy's EnumType registered at the
// subcommand level; other properties fall back to built-in scalar types.
function cliffyTypeFor(key: string, jsonType: string | undefined): string {
  if (key === CATEGORY_PROP) return CATEGORY_PROP
  if (jsonType === "integer") return "integer"
  if (jsonType === "number") return "number"
  if (jsonType === "boolean") return "boolean"
  return "string"
}

/**
 * Run `cli.parse(argv)` and map thrown cliffy `ValidationError` to an
 * exit(2) with the message on stderr. Any other error bubbles as an
 * exit(1) (the per-subcommand action handler already catches tool
 * errors before they reach here).
 */
export async function runCli(
  cli: Command,
  argv: readonly string[],
  stderr: NodeJS.WritableStream = process.stderr,
): Promise<void> {
  try {
    await cli.parse([...argv])
  } catch (err) {
    if (err instanceof ValidationError) {
      stderr.write(`${err.message}\n`)
      process.exit(2)
    }
    stderr.write(
      `${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    )
    process.exit(1)
  }
}
