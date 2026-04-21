/**
 * Stricli adapter: same contract as `@carlwr/zshref`'s cliffy adapter, but
 * built on Bloomberg's `@stricli/core`. Walks `toolDefs` and exposes each as
 * a subcommand under a shared route map.
 *
 * This adapter only covers per-subcommand `--help` (which stricli emits from
 * `docs.brief` + `docs.fullDescription` + `docs.customUsage`). Root `--help`,
 * `--version`, and stream/exit-code routing live in `bin.ts` — stricli
 * emits root help/version to stdout and cannot be reconfigured, so the bin
 * intercepts argv before `run()` when the request is clearly informational.
 *
 * Visual notes:
 *   - Enum-kind flags force stricli to append `[a|b|c|…]` in the FLAGS
 *     column (see @stricli/core formatDocumentationForFlagParameters). For
 *     our `--category` this overflows 80 cols with 16 values. We use
 *     `kind: "parsed"` + `buildChoiceParser([...docCategories])` instead
 *     to get the same parsing + "did you mean" error without the dump.
 *   - `customUsage` is a free-form string, so we write POSIX-style
 *     `--flag=VALUE` synopses with uppercase placeholders, mirroring the
 *     cliffy adapter's output.
 */

import type { DocCorpus } from "@carlwr/zsh-core"
import { docCategories } from "@carlwr/zsh-core"
import type { ToolDef, ToolInputSchema } from "@carlwr/zsh-core-tooldef"
import {
  type Application,
  type CommandContext,
  buildApplication,
  buildChoiceParser,
  buildCommand,
  buildRouteMap,
  numberParser,
  text_en,
} from "@stricli/core"

// Shape-compatible alias for stricli's non-exported `CustomUsage` type
// (see @stricli/core dist/index.d.ts). A route-map's `docs.customUsage`
// accepts a mix of plain usage strings and `{ input, brief }` objects.
interface CustomUsage {
  readonly input: string
  readonly brief: string
}

export interface BuildAppOpts {
  readonly corpus: DocCorpus
  readonly toolDefs: readonly ToolDef[]
  readonly name: string
  readonly version: string
}

interface JsonSchemaProp {
  readonly type?: string
  readonly description?: string
}

interface JsonSchema {
  readonly properties?: Readonly<Record<string, JsonSchemaProp>>
  readonly required?: readonly string[]
}

const CATEGORY_PROP = "category"

const ROOT_BRIEF =
  "query the static zsh reference from the command line (JSON on stdout)"

export function subcommandName(toolName: string): string {
  return toolName.replace(/^zsh_/, "").toLowerCase()
}

/**
 * Uppercase placeholder for a JSON-schema property key, e.g. `raw → RAW`.
 * Stricli echoes the placeholder verbatim in both the usage synopsis
 * (when `customUsage` is set) and the FLAGS column.
 */
function placeholderOf(key: string): string {
  return key.toUpperCase()
}

/**
 * Compact POSIX-style sub-usage line: required flags unbracketed, optional
 * flags bracketed, `=PLACEHOLDER` (not space) between flag and value. Mirrors
 * the cliffy adapter's synopsis shape.
 */
function buildSubUsage(
  props: Readonly<Record<string, JsonSchemaProp>>,
  required: ReadonlySet<string>,
): string {
  return Object.keys(props)
    .map(key => {
      const token = `--${key}=${placeholderOf(key)}`
      return required.has(key) ? token : `[${token}]`
    })
    .join(" ")
}

/**
 * Stricli's `fullDescription` slot is emitted as-is, so we hand it a block
 * shaped for policy: brief line, blank, expanded prose. The incoming
 * `td.description` is already policy-shaped (paragraphs at COL=1, bulleted
 * lists at COL>1 within 80 cols).
 */
function composeFullDescription(td: ToolDef): string {
  return `${td.brief}\n\n${td.description}`
}

export function buildApp(opts: BuildAppOpts): Application<CommandContext> {
  const routes: Record<string, ReturnType<typeof buildCommand>> = {}

  for (const td of opts.toolDefs) {
    routes[subcommandName(td.name)] = buildSubcommand(opts.corpus, td)
  }

  const root = buildRouteMap({
    routes,
    docs: { brief: ROOT_BRIEF },
  })

  return buildApplication(root, {
    name: opts.name,
    versionInfo: { currentVersion: opts.version },
    scanner: {
      caseStyle: "original",
    },
    documentation: {
      // Skip the inline enum expansion in sub usage lines. Our enum flag
      // is already `kind: "parsed"`, so this is defence in depth.
      useAliasInUsageLine: false,
      // Keep sub USAGE tight: omit optional flags from the auto-generated
      // usage synopsis. We supply `customUsage` anyway, so this only
      // governs fallback paths.
      onlyRequiredInUsageLine: false,
      caseStyle: "original",
    },
    // Map stricli's exit codes to the project's 0/1/2 contract.
    // Stricli's own exit codes for scanner errors are negative constants
    // (InvalidArgument=-4, UnknownCommand=-5) — those are handled in
    // `runApp` in bin.ts. `determineExitCode` fires only for thrown errors
    // from the command func (our JSON-write path), which we treat as 1.
    determineExitCode: () => 1,
    localization: {
      defaultLocale: "en",
      loadText: () => ({
        ...text_en,
        // Lowercase "Usage:"/"Flags:"/... aligns with most POSIX tools and
        // matches the cliffy output shape.
        headers: {
          ...text_en.headers,
          usage: "Usage:",
          flags: "Flags:",
          commands: "Commands:",
          arguments: "Arguments:",
          aliases: "Aliases:",
        },
      }),
    },
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
    flags[key] = makeFlagSpec(key, spec, required.has(key), td.flagBriefs[key])
  }

  const customUsage: readonly (string | CustomUsage)[] = [
    buildSubUsage(props, required),
  ]

  return buildCommand({
    parameters: {
      // biome-ignore lint/suspicious/noExplicitAny: dynamic construction from JSON Schema, typed inputs land in `ToolInputSchema`
      flags: flags as any,
    },
    docs: {
      brief: td.brief,
      fullDescription: composeFullDescription(td),
      customUsage,
    },
    func: async function (this: CommandContext, parsedFlags) {
      const input = parsedFlags as unknown as ToolInputSchema
      const result = td.execute(corpus, input)
      this.process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    },
  })
}

/**
 * Translate a JSON-Schema property into a stricli flag spec.
 *
 * `category` uses `kind: "parsed"` with `buildChoiceParser` rather than
 * `kind: "enum"` — stricli's enum kind unconditionally appends
 * `[a|b|c|…]` to the FLAGS-column brief, which overflows 80 cols for our
 * 16-value category list. The parsed variant gives identical validation
 * (`buildChoiceParser` throws on non-members, which stricli maps to a
 * scanner error) without the inline dump.
 *
 * Required flags carry a "(required)" suffix in the brief, since stricli's
 * FLAGS-column layout only signals required vs optional with a subtle
 * space-vs-bracket difference. The explicit tag matches the cliffy
 * adapter's visual cue.
 */
function makeFlagSpec(
  key: string,
  spec: JsonSchemaProp,
  isRequired: boolean,
  flagBrief: string | undefined,
): unknown {
  const baseBrief = flagBrief ?? spec.description ?? ""
  const brief = isRequired ? `${baseBrief} (required)` : baseBrief
  const placeholder = placeholderOf(key)
  const common = { brief, placeholder, optional: !isRequired }
  if (key === CATEGORY_PROP) {
    return {
      kind: "parsed",
      parse: buildChoiceParser([...docCategories]),
      ...common,
    }
  }
  if (spec.type === "integer" || spec.type === "number") {
    return { kind: "parsed", parse: numberParser, ...common }
  }
  return { kind: "parsed", parse: (s: string) => s, ...common }
}
