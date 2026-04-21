/**
 * Shared-fixture bridge between TS `execute()` and the Rust CLI.
 *
 * Each fixture file under `zshref-rs/tests/fixtures/<tool>/<case>.json`
 * holds `{ tool, input, argv, expectedOutput }`:
 *   - `input` is what the TS `execute(corpus, input)` sees.
 *   - `argv` is what the Rust CLI receives on the command line.
 *   - `expectedOutput` is the JSON both must produce (score fields
 *     stripped — fuzzysort vs. nucleo scores are not expected to match).
 *
 * Modes:
 *   - Write (env `BZ_WRITE_RUST_FIXTURES=1`): regenerate fixtures from
 *     current `execute()` output. Run this whenever intended behaviour
 *     changes; review the resulting diff before committing.
 *   - Default (assert): load fixtures and verify current `execute()`
 *     still matches. Catches silent TS-side drift in `pnpm test`.
 *
 * The Rust-side integration test (`zshref-rs/tests/integration.rs`)
 * reads the same files.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { loadCorpus } from "@carlwr/zsh-core"
import { describe, expect, test } from "vitest"
import { toolDefs } from "../tool-defs.ts"

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
  // classify
  { tool: "zsh_classify", name: "auto_cd", input: { raw: "AUTO_CD" } },
  { tool: "zsh_classify", name: "echo", input: { raw: "echo" } },
  { tool: "zsh_classify", name: "double_bracket", input: { raw: "[[" } },
  { tool: "zsh_classify", name: "no_notify", input: { raw: "NO_NOTIFY" } },
  { tool: "zsh_classify", name: "bogus", input: { raw: "not-a-real-token" } },

  // search
  { tool: "zsh_search", name: "empty_limit_5", input: { limit: 5 } },
  { tool: "zsh_search", name: "query_printf", input: { query: "printf" } },
  {
    tool: "zsh_search",
    name: "query_echo_builtin_limit_3",
    input: { query: "echo", category: "builtin", limit: 3 },
  },
  {
    tool: "zsh_search",
    name: "category_option_limit_3",
    input: { category: "option", limit: 3 },
  },
  {
    tool: "zsh_search",
    name: "no_hits",
    input: { query: "xxyyzz", limit: 5 },
  },

  // describe
  {
    tool: "zsh_describe",
    name: "builtin_echo",
    input: { category: "builtin", id: "echo" },
  },
  {
    tool: "zsh_describe",
    name: "option_autocd",
    input: { category: "option", id: "autocd" },
  },
  {
    tool: "zsh_describe",
    name: "builtin_nope",
    input: { category: "builtin", id: "nope" },
  },

  // lookup_option
  { tool: "zsh_lookup_option", name: "auto_cd", input: { raw: "AUTO_CD" } },
  { tool: "zsh_lookup_option", name: "no_auto_cd", input: { raw: "NO_AUTO_CD" } },
  { tool: "zsh_lookup_option", name: "notify", input: { raw: "NOTIFY" } },
  {
    tool: "zsh_lookup_option",
    name: "not_an_option",
    input: { raw: "not-an-option" },
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
 * Strip `score` fields recursively. fuzzysort (TS) and nucleo-matcher
 * (Rust) use different scoring scales; comparing exact numeric scores
 * across them is not meaningful. The ranking order is what matters and
 * is what both sides are written to produce identically.
 */
function stripScores(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripScores)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "score") continue
      out[k] = stripScores(v)
    }
    return out
  }
  return value
}

function runTool(c: Case): unknown {
  const td = toolDefs.find(t => t.name === c.tool)
  if (!td) throw new Error(`unknown tool ${c.tool}`)
  return td.execute(corpus, c.input)
}

function fixturePath(c: Case): string {
  const sub = c.tool.replace(/^zsh_/, "")
  return join(fixturesRoot, sub, `${c.name}.json`)
}

describe.runIf(writeMode)("rust fixtures — write mode", () => {
  test.each(cases.map(c => [`${c.tool}/${c.name}`, c] as const))(
    "write %s",
    (_n, c) => {
      const expected = stripScores(runTool(c))
      const payload = {
        tool: c.tool,
        input: c.input,
        argv: toArgv(c.tool, c.input as Record<string, unknown>),
        expectedOutput: expected,
      }
      const path = fixturePath(c)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
    },
  )
})

describe.runIf(!writeMode)("rust fixtures — assert mode (TS drift guard)", () => {
  test.each(cases.map(c => [`${c.tool}/${c.name}`, c] as const))(
    "%s matches fixture",
    (_n, c) => {
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
      const actual = stripScores(runTool(c))
      expect(actual).toEqual(fixture.expectedOutput)
    },
  )
})
