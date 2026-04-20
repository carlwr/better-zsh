/**
 * Cliffy tree builder: walks `ToolDef`s and exposes each as a subcommand.
 *
 * Subcommand name = `ToolDef.name` with the `zsh_` prefix stripped — the
 * root bin already scopes under `zshref`, so the prefix is redundant.
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
}

interface JsonSchema {
  readonly properties?: Readonly<Record<string, JsonSchemaProp>>
  readonly required?: readonly string[]
}

const CATEGORY_PROP = "category"

// Pre-wrap widths for description text. Cliffy does not word-wrap, so we
// insert `\n` at word boundaries and cliffy re-indents continuations.
// 80-col terminal target; DESC_WIDTH 76 leaves margin after cliffy's
// 2-space indent. ToolDef.brief (<=50 chars, single line) is kept
// unwrapped — cliffy uses the first `\n`-separated line as the
// commands-column entry at root `--help`.
const DESC_WIDTH = 76
const OPTION_DESC_WIDTH = 50

const ROOT_DESCRIPTION = `Query the bundled static zsh reference from the command line.

On a successful tool invocation, stdout is valid JSON (pretty-printed, newline-terminated) — pipe to \`jq\`. All other output (help, version, errors) goes to stderr. ANSI colors are auto-disabled when stderr is not a TTY.

Exit codes:
  0  success (also for {match:null} / empty matches)
  1  unexpected internal error
  2  invalid input (bad flag, enum, or subcommand)

Environment:
  NO_COLOR  present+non-empty disables ANSI colors (no-color.org)
  NOCOLOR   accepted as alias for NO_COLOR`

const ROOT_EXAMPLES: ReadonlyArray<readonly [name: string, cmd: string]> = [
  ["Classify a token", "zshref classify --raw AUTO_CD"],
  ["Fuzzy search", "zshref search --query printf --limit 5"],
  ["Describe by id", "zshref describe --category builtin --id echo"],
  ["Look up an option", "zshref lookup_option --raw NO_AUTO_CD"],
  ["Detailed help", "zshref <command> --help"],
]

export function subcommandName(toolName: string): string {
  return toolName.replace(/^zsh_/, "").toLowerCase()
}

/**
 * Standard + tolerance: NO_COLOR is the documented spec (disables colors
 * when *present and non-empty*); NOCOLOR is accepted as an alias since
 * users reach for either spelling.
 */
function noColorEnv(env: NodeJS.ProcessEnv): boolean {
  const v = env.NO_COLOR ?? env.NOCOLOR
  return v !== undefined && v !== ""
}

function shouldColor(
  stream: NodeJS.WritableStream & { isTTY?: boolean },
  env: NodeJS.ProcessEnv,
): boolean {
  return stream.isTTY === true && !noColorEnv(env)
}

/**
 * Write `text` (with trailing newline) and exit 0 after the write drains.
 * Returns a Promise so cliffy's `Promise.all(ctx.actions)` awaits the
 * flush — otherwise cliffy's normal post-action return path races the
 * kernel-level fd write and truncates the output on piped (non-TTY)
 * stderr. Node's `process.exit()` does not wait for async writes, so the
 * exit itself must be deferred to the write callback.
 */
function writeAndExit(
  stream: NodeJS.WritableStream,
  text: string,
): Promise<never> {
  return new Promise<never>(resolve => {
    stream.write(`${text}\n`, () => {
      // resolve first so cliffy's Promise.all settles; exit runs next tick
      resolve(undefined as never)
      process.exit(0)
    })
  })
}

export function buildCli(opts: BuildCliOpts): Command {
  const stdout = opts.stdout ?? process.stdout
  const stderr = opts.stderr ?? process.stderr
  // Colors follow the destination of human-facing output (stderr). Pretty
  // JSON on stdout is always uncolored — keep downstream `jq` pipelines
  // parseable.
  const colors = shouldColor(stderr, process.env)
  // long: true always — cliffy's default passes long=false to `-h` and
  // `long=true` to `--help`; the difference is that short-mode truncates
  // option descriptions at their first `\n`. Our descriptions are
  // multi-line by design (pre-wrapped for 80 cols, with embedded lists),
  // so short-mode hides information we want visible in both spellings.
  const helpOpts = { colors, hints: false, long: true } as const

  const root = new Command()
    .name(opts.name)
    .version(opts.version)
    .description(wrapText(ROOT_DESCRIPTION, DESC_WIDTH))
    .usage("<command> [options]")
    // throwErrors: cliffy ValidationError surfaces as a thrown exception
    // rather than direct stderr/exit so we can map to exit code 2.
    .throwErrors()
    // Cliffy's default --help / --version both `console.log` → stdout.
    // Route to stderr so the "stdout is always JSON" contract holds even
    // when users pipe `zshref --help | …`. Both options are registered
    // with { global: true } by cliffy, so subs inherit automatically.
    .helpOption("-h, --help", "Show this help.", async function () {
      await writeAndExit(stderr, this.getHelp(helpOpts))
    })
    .versionOption("-V, --version", "Show the version.", async function () {
      // `getMainCommand()` walks to root: subs set `version("")` to
      // suppress the "Version:" line in their own --help, so their own
      // getVersion() returns "". We always want the root (program) version.
      await writeAndExit(stderr, this.getMainCommand().getVersion() ?? "")
    })
    .help(helpOpts)

  for (const [name, cmdLine] of ROOT_EXAMPLES) root.example(name, cmdLine)

  const categoryType = new EnumType([...docCategories])

  for (const td of opts.toolDefs) {
    const schema = td.inputSchema as JsonSchema
    const props = schema.properties ?? {}
    const required = new Set(schema.required ?? [])
    const subName = subcommandName(td.name)

    const sub = new Command()
      .name(subName)
      .description(composeSubDescription(td))
      .usage(buildUsage(props, required))
      // version(""): suppresses the inherited "Version:" line cliffy would
      // otherwise emit on every sub --help (empty string is falsy).
      .version("")
      // hints: false suppresses cliffy's auto-appended hints, which include
      // an unwanted "(Values: a, b, c, ...)" enum dump that overflows 80
      // cols for our --category. We re-add "(required)" manually below.
      .help(helpOpts)
      .type(CATEGORY_PROP, categoryType, { global: false })

    for (const [key, spec] of Object.entries(props)) {
      const flag = propertyToOption(key, spec, required.has(key))
      sub.option(flag.flagSpec, wrapText(flag.desc, OPTION_DESC_WIDTH), {
        required: required.has(key),
      })
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
      stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    })

    root.command(subName, sub)
  }

  root.command("completions", new CompletionsCommand().help(helpOpts))

  return root
}

/**
 * Cliffy renders the first `\n`-separated line of `.description()` in the
 * root `--help` commands column — so the unwrapped brief goes there. The
 * sub's own `--help` shows the full composed block.
 */
function composeSubDescription(td: ToolDef): string {
  return `${td.brief}\n\n${wrapText(td.description, DESC_WIDTH)}`
}

/**
 * Uppercase placeholder for a JSON-schema property key (e.g. `raw → RAW`).
 * Cliffy echoes placeholders verbatim, so this gives POSIX-style
 * `--flag <VALUE>` instead of `--flag <value>`.
 */
function placeholderOf(key: string): string {
  return key.toUpperCase()
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
  const typeTag = cliffyTypeFor(key, spec.type)
  const ph = placeholderOf(key)
  const placeholder = isRequired ? `<${ph}:${typeTag}>` : `[${ph}:${typeTag}]`
  return {
    flagSpec: `--${key} ${placeholder}`,
    desc: `${spec.description ?? ""}${isRequired ? " (required)" : ""}`,
  }
}

/**
 * Compact usage synopsis, e.g. `--raw=RAW [--category=CATEGORY]`.
 *
 * Uses `=` (not space) between flag and value: cliffy's `highlightArguments()`
 * splits on whitespace first, so `[--flag VALUE]` becomes two un-parseable
 * tokens. `[--flag=VALUE]` is one bracketed token (also POSIX long-option
 * form). Required flags are unbracketed and render unhighlighted; optional
 * are bracketed and colorized — small asymmetry, syntactically correct.
 */
function buildUsage(
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
 * Word-wrap `text` so no line exceeds `width` chars. Preserves blank-line
 * paragraph breaks (`\n\n+`), hard newlines, and leading indent on wrapped
 * lines (so list items keep their hang). Words longer than `width` are
 * left unbroken: breaking identifiers is worse than a wide line.
 */
export function wrapText(text: string, width: number): string {
  return text
    .split(/\n{2,}/)
    .map(para =>
      para
        .split(/\n/)
        .map(line => wrapLine(line, width))
        .join("\n"),
    )
    .join("\n\n")
}

function wrapLine(line: string, width: number): string {
  if (line.length <= width) return line
  const indent = line.match(/^\s*/)?.[0] ?? ""
  const words = line
    .slice(indent.length)
    .split(/\s+/)
    .filter(w => w.length > 0)
  const lines: string[] = []
  let cur = indent
  for (const w of words) {
    if (cur === indent) {
      cur += w
    } else if (cur.length + 1 + w.length <= width) {
      cur += ` ${w}`
    } else {
      lines.push(cur)
      cur = indent + w
    }
  }
  if (cur !== indent) lines.push(cur)
  return lines.join("\n")
}

// `category` uses the EnumType registered per-sub; other props fall back
// to cliffy built-in scalar types.
function cliffyTypeFor(key: string, jsonType: string | undefined): string {
  if (key === CATEGORY_PROP) return CATEGORY_PROP
  if (jsonType === "integer") return "integer"
  if (jsonType === "number") return "number"
  if (jsonType === "boolean") return "boolean"
  return "string"
}

/**
 * Parse `argv` and map cliffy `ValidationError` to exit(2); any other
 * error to exit(1). Tool-layer errors are already caught in the
 * sub action handler, so anything reaching here is unexpected.
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
