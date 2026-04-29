/**
 * Bridge TS `execute()` output to the Rust CLI via checked-in fixtures.
 *
 * Each case file holds `{ tool, input, argv, expectedOutput }`:
 *   - `input` is what TS `execute(corpus, input)` sees.
 *   - `argv` is what the Rust CLI receives on the command line.
 *   - `expectedOutput` is the JSON both must produce (score fields
 *     stripped — TS fuzzysort and the Rust ASCII scorer use different
 *     scales, so numeric scores aren't compared).
 *
 * Modes:
 *   - Write (`BZ_WRITE_RUST_FIXTURES=1`): regenerate from current
 *     `execute()`; review diffs before commit.
 *   - Default: load fixtures and assert parity (catches TS drift). The
 *     Rust crate's integration tests read the same tree.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { loadCorpus } from "@carlwr/zsh-core"
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js"
import { describe, expect, test } from "vitest"
import { type ToolDef, toolDefs } from "../tool-defs.ts"

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const repoRoot = join(pkgDir, "..", "..")
const fixturesRoot = join(repoRoot, "zshref-rs", "tests", "fixtures")

const corpus = loadCorpus()
const writeMode = process.env.BZ_WRITE_RUST_FIXTURES === "1"

interface Case {
  readonly tool: string
  readonly name: string
  readonly input: Readonly<Record<string, unknown>>
}

const cases: readonly Case[] = [
  // docs
  { tool: "zsh_docs", name: "auto_cd", input: { raw: "AUTO_CD" } },
  { tool: "zsh_docs", name: "no_auto_cd", input: { raw: "NO_AUTO_CD" } },
  { tool: "zsh_docs", name: "notify", input: { raw: "NOTIFY" } },
  { tool: "zsh_docs", name: "echo", input: { raw: "echo" } },
  { tool: "zsh_docs", name: "double_bracket", input: { raw: "[[" } },
  { tool: "zsh_docs", name: "no_notify", input: { raw: "NO_NOTIFY" } },
  { tool: "zsh_docs", name: "bogus", input: { raw: "not-a-real-token" } },
  // multi-match: `for` resolves in both complex_command and reserved_word
  { tool: "zsh_docs", name: "for_multi_match", input: { raw: "for" } },
  // direct ∥ resolver: `%number` is a literal job_spec key; resolver
  // would map non-template digit tail to `%number` — direct keeps it.
  {
    tool: "zsh_docs",
    name: "job_spec_template_key",
    input: { raw: "%number", category: "job_spec" },
  },
  // category-constrained lookup
  {
    tool: "zsh_docs",
    name: "builtin_echo",
    input: { raw: "echo", category: "builtin" },
  },
  {
    tool: "zsh_docs",
    name: "option_autocd",
    input: { raw: "autocd", category: "option" },
  },
  {
    tool: "zsh_docs",
    name: "not_an_option",
    input: { raw: "not-an-option" },
  },
  // Rust resolver parity: category-specific resolver forms that are not
  // literal corpus ids.
  {
    tool: "zsh_docs",
    name: "history_bang_number",
    input: { raw: "!42", category: "history" },
  },
  {
    tool: "zsh_docs",
    name: "history_search",
    input: { raw: "!?zsh", category: "history" },
  },
  {
    tool: "zsh_docs",
    name: "glob_flag_wrapped",
    input: { raw: "(#i)", category: "glob_flag" },
  },
  {
    tool: "zsh_docs",
    name: "glob_qualifier_extended",
    input: { raw: "(#q@)", category: "glob_qualifier" },
  },

  // search
  { tool: "zsh_search", name: "query_printf", input: { query: "printf" } },
  {
    tool: "zsh_search",
    name: "query_echo_builtin_limit_3",
    input: { query: "echo", category: "builtin", limit: 3 },
  },
  {
    tool: "zsh_search",
    name: "no_hits",
    input: { query: "xxyyzz", limit: 5 },
  },
  // metadata-only; constrain to one category so the fuzzy tier
  // (TS fuzzysort vs Rust ASCII matcher have slightly different
  // thresholds) doesn't disturb matchesTotal parity.
  {
    tool: "zsh_search",
    name: "limit_zero",
    input: { query: "echo", category: "builtin", limit: 0 },
  },
  {
    tool: "zsh_search",
    name: "history_bang_number",
    input: { query: "!42", category: "history", limit: 3 },
  },
  {
    tool: "zsh_search",
    name: "glob_flag_wrapped",
    input: { query: "(#i)", category: "glob_flag", limit: 3 },
  },

  // list
  { tool: "zsh_list", name: "default_limit_5", input: { limit: 5 } },
  {
    tool: "zsh_list",
    name: "category_option_limit_3",
    input: { category: "option", limit: 3 },
  },
  {
    // Exercises subKind parity: `reserved_word` records surface `pos`.
    tool: "zsh_list",
    name: "category_reserved_word_limit_5",
    input: { category: "reserved_word", limit: 5 },
  },
  // metadata-only
  {
    tool: "zsh_list",
    name: "limit_zero",
    input: { limit: 0 },
  },
]

/** Map a tool name + input object to a Rust-CLI argv. */
function toArgv(toolName: string, input: Record<string, unknown>): string[] {
  const sub = toolName.replace(/^zsh_/, "")
  const argv: string[] = [sub]
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null) continue
    argv.push(`--${k}`, String(v))
  }
  return argv
}

/**
 * Strip fields that are known not to match across TS vs Rust:
 *
 * - `score`: TS fuzzysort vs the Rust fuzzy scorer use different scales;
 *   ranking order is what both sides align on.
 */
const DROPPED_KEYS = new Set(["score"])

function stripScores(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripScores)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (DROPPED_KEYS.has(k)) continue
      out[k] = stripScores(v)
    }
    return out
  }
  return value
}

function getTool(name: string): ToolDef {
  const td = toolDefs.find(t => t.name === name)
  if (!td) throw new Error(`unknown tool ${name}`)
  return td
}

function runTool(c: Case): unknown {
  return getTool(c.tool).execute(corpus, c.input)
}

/** Ajv validators, lazily compiled once per tool name. */
const ajv = new Ajv2020({ allErrors: true, strict: false })
const validators = new Map<string, ValidateFunction>()
function validatorFor(toolName: string): ValidateFunction {
  let v = validators.get(toolName)
  if (!v) {
    v = ajv.compile(getTool(toolName).outputSchema)
    validators.set(toolName, v)
  }
  return v
}

function fixturePath(c: Case): string {
  const sub = c.tool.replace(/^zsh_/, "")
  return join(fixturesRoot, sub, `${c.name}.json`)
}

describe.runIf(writeMode)("rust fixtures — write mode", () => {
  test.each(
    cases.map(c => [`${c.tool}/${c.name}`, c] as const),
  )("write %s", (_n, c) => {
    // Fixtures keep `score` for shape documentation; asserts strip it.
    const payload = {
      tool: c.tool,
      input: c.input,
      argv: toArgv(c.tool, c.input as Record<string, unknown>),
      expectedOutput: runTool(c),
    }
    const path = fixturePath(c)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  })
})

describe.runIf(!writeMode)(
  "rust fixtures — assert mode (TS drift guard)",
  () => {
    test.each(
      cases.map(c => [`${c.tool}/${c.name}`, c] as const),
    )("%s matches fixture", (_n, c) => {
      const path = fixturePath(c)
      if (!existsSync(path)) {
        // No fixture yet — skip rather than fail. Users regenerate
        // fixtures with BZ_WRITE_RUST_FIXTURES=1 once, commit, then
        // this branch is not taken.
        return
      }
      const fixture = JSON.parse(readFileSync(path, "utf8")) as {
        expectedOutput: unknown
      }
      const raw = runTool(c)
      const actual = stripScores(raw)
      expect(actual).toEqual(stripScores(fixture.expectedOutput))

      // Validate the un-stripped value: the search schema requires
      // `score` on every match.
      const validate = validatorFor(c.tool)
      const ok = validate(raw)
      if (!ok) {
        throw new Error(
          `outputSchema validation failed for ${c.tool}/${c.name}: ${JSON.stringify(validate.errors)}`,
        )
      }
    })
  },
)
