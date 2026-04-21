#!/usr/bin/env node

/**
 * @packageDocumentation
 *
 * CLI bin for the stricli variant. See `src/adapter.ts` for the tool-def →
 * stricli wiring; this file handles the cross-cutting concerns stricli
 * cannot be reconfigured to provide:
 *
 *   - Root `--help` / `--version` are intercepted here and printed to
 *     stderr (stricli would print to stdout, violating the policy MUST
 *     that stdout is reserved for JSON). Our own root-help text is also
 *     shorter and more scannable than stricli's auto-generated tree
 *     (which lists every sub's full usage line).
 *
 *   - For sub-level `--help` (`prog sub --help`), we still want stricli's
 *     layout — but routed to stderr. We detect that argv shape and pass a
 *     `StricliProcess` whose stdout is the real stderr for the duration
 *     of the call.
 *
 *   - Stricli's scanner-error exit codes are negative constants (-4
 *     InvalidArgument, -5 UnknownCommand). We normalize to the project's
 *     2 (bad input) / 1 (internal error) / 0 (success) contract.
 */

import process from "node:process"
import { loadCorpus } from "@carlwr/zsh-core"
import { toolDefs } from "@carlwr/zsh-core-tooldef"
import { ExitCode, run } from "@stricli/core"
import { buildApp, subcommandName } from "./src/adapter.ts"
import { CLI_BIN_NAME, PKG_VERSION } from "./src/pkg-info.ts"

// Description body is printed with a 2-space indent. `DESC_WIDTH` + 2
// indent stays inside the 80-col budget. Other top-level sections
// (Exit codes, Environment) are their own headings, not sub-sections.
const DESC_WIDTH = 76

const ROOT_DESCRIPTION = `Query the bundled static zsh reference from the command line.

On a successful tool invocation, stdout is valid JSON (pretty-printed, newline-terminated) — pipe to \`jq\`. All other output (help, version, errors) goes to stderr. ANSI colors are auto-disabled when stderr is not a TTY.

Use \`${CLI_BIN_NAME} <command> --help\` for per-command details.`

// Each example is a free-form line — no two-column layout. Cliffy can
// color-code the two columns; we can't emit ANSI ourselves (policy).
const ROOT_EXAMPLES: readonly string[] = [
  `# classify a raw zsh token`,
  `${CLI_BIN_NAME} classify --raw AUTO_CD`,
  ``,
  `# fuzzy-search with limit`,
  `${CLI_BIN_NAME} search --query printf --limit 5`,
  ``,
  `# describe a known {category, id}`,
  `${CLI_BIN_NAME} describe --category builtin --id echo`,
  ``,
  `# look up a NO_* option`,
  `${CLI_BIN_NAME} lookup_option --raw NO_AUTO_CD`,
  ``,
  `# per-command help`,
  `${CLI_BIN_NAME} <command> --help`,
]

/**
 * Standard + tolerance: NO_COLOR is the documented spec (disables colors
 * when *present and non-empty*); NOCOLOR is accepted as an alias since
 * users reach for either spelling.
 */
function noColorEnv(env: NodeJS.ProcessEnv): boolean {
  const v = env.NO_COLOR ?? env.NOCOLOR
  return v !== undefined && v !== ""
}

/**
 * Word-wrap `text` so no single line exceeds `width` chars. Preserves
 * blank-line paragraph breaks, existing hard newlines, and the leading
 * indent of each input line (list items keep their hang). Unbreakable
 * tokens (identifiers, URLs) are left as-is — one overflowing word is
 * less bad than a broken identifier.
 */
function wrapText(text: string, width: number): string {
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

// Using `Flags:` to match stricli's sub-level heading (the built-in
// emits `Flags:` there, underlined, for subcommand help). Matching the
// name here keeps the top-level and sub-level vocabularies consistent
// even though we can't match the ANSI underline without emitting raw
// escapes — which the policy forbids us from doing by hand.
function renderRootHelp(binName: string, subNames: readonly string[]): string {
  const lines: string[] = []
  lines.push(`Usage: ${binName} <command> [options]`)
  lines.push("")
  lines.push("Description:")
  lines.push("")
  for (const para of wrapText(ROOT_DESCRIPTION, DESC_WIDTH).split("\n")) {
    lines.push(para === "" ? "" : `  ${para}`)
  }
  lines.push("")
  lines.push("Exit codes:")
  lines.push("  0  success (also for {match:null} / empty matches)")
  lines.push("  1  unexpected internal error")
  lines.push("  2  invalid input (bad flag, enum, or subcommand)")
  lines.push("")
  lines.push("Environment:")
  lines.push("  NO_COLOR          present+non-empty disables ANSI colors")
  lines.push("  NOCOLOR           accepted as alias for NO_COLOR")
  lines.push("  STRICLI_NO_COLOR  stricli's own disable-color signal (forwarded)")
  lines.push("")
  lines.push("Commands:")
  const briefs = Object.fromEntries(
    toolDefs.map(td => [subcommandName(td.name), td.brief] as const),
  )
  const pad = Math.max(...subNames.map(n => n.length))
  for (const n of subNames) {
    lines.push(`  ${n.padEnd(pad)}  ${briefs[n] ?? ""}`)
  }
  lines.push("")
  lines.push("Flags:")
  lines.push("  -h, --help     Show this help and exit.")
  lines.push("  -v, --version  Show the version and exit.")
  lines.push("")
  lines.push("Examples:")
  for (const ex of ROOT_EXAMPLES) {
    lines.push(ex === "" ? "" : `  ${ex}`)
  }
  return lines.join("\n")
}

interface ArgShape {
  readonly kind: "root-help" | "root-version" | "sub-help" | "normal"
}

function classifyArgv(argv: readonly string[]): ArgShape {
  if (argv.length === 0) return { kind: "root-help" }
  const first = argv[0] ?? ""
  if (first === "--help" || first === "-h") return { kind: "root-help" }
  if (first === "--version" || first === "-v") return { kind: "root-version" }
  if (argv.some(a => a === "--help" || a === "-h")) return { kind: "sub-help" }
  return { kind: "normal" }
}

function writeLn(stream: NodeJS.WritableStream, text: string): void {
  stream.write(`${text}\n`)
}

/**
 * Stricli's exit-code enum includes negative sentinels for scanner failures.
 * Collapse into the policy-wide 0/1/2 codes. `process.exitCode` is what
 * stricli sets via the `run` promise; we read it after `run` settles.
 */
function normalizeExitCode(raw: number): number {
  if (raw === ExitCode.Success) return 0
  if (raw === ExitCode.InvalidArgument || raw === ExitCode.UnknownCommand) {
    return 2
  }
  // CommandRunError, CommandLoadError, ContextLoadError, InternalError, and
  // any unexpected code collapse to "unexpected internal error" (1).
  return 1
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const shape = classifyArgv(argv)
  const subNames = toolDefs.map(td => subcommandName(td.name))

  if (shape.kind === "root-help") {
    writeLn(process.stderr, renderRootHelp(CLI_BIN_NAME, subNames))
    process.exit(0)
  }
  if (shape.kind === "root-version") {
    writeLn(process.stderr, PKG_VERSION)
    process.exit(0)
  }

  const corpus = loadCorpus()
  const app = buildApp({
    corpus,
    toolDefs,
    name: CLI_BIN_NAME,
    version: PKG_VERSION,
  })

  // Route stricli's help output to stderr when the caller asked for help.
  // Normal invocations keep the real stdout — that's the JSON contract.
  const stdoutForStricli =
    shape.kind === "sub-help" ? process.stderr : process.stdout

  const env = { ...process.env }
  // NOCOLOR is a common misspelling; forward to the documented
  // STRICLI_NO_COLOR so stricli strips ANSI internally. NO_COLOR is already
  // inspected by stricli's color-depth helper on the stream side via the
  // optional `getColorDepth(env)` hook.
  if (noColorEnv(env)) {
    env.STRICLI_NO_COLOR = "1"
  }

  const stricliProcess = {
    stdout: {
      write: (s: string) => {
        stdoutForStricli.write(s)
      },
      // Tell stricli there's no color when the *destination* stream isn't
      // a TTY. This mirrors the policy MUST for auto-disabling ANSI off-TTY.
      getColorDepth: () =>
        (stdoutForStricli as { isTTY?: boolean }).isTTY === true &&
        !noColorEnv(env)
          ? 4
          : 1,
    },
    stderr: {
      write: (s: string) => {
        process.stderr.write(s)
      },
      getColorDepth: () =>
        process.stderr.isTTY === true && !noColorEnv(env) ? 4 : 1,
    },
    env,
    exitCode: 0 as number,
  }

  await run(app, argv, { process: stricliProcess })
  process.exit(normalizeExitCode(Number(stricliProcess.exitCode ?? 0)))
}

main().catch(err => {
  process.stderr.write(
    `${CLI_BIN_NAME}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  )
  process.exit(1)
})
