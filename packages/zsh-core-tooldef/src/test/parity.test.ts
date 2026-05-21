/**
 * Cross-language parity: TS `tool.execute()` vs the Rust `zshref` CLI's
 * `batch` subcommand. One JSONL session per test file (no per-case spawn
 * overhead).
 *
 * Score divergence: TS uses fuzzysort, Rust uses an in-tree ASCII matcher.
 * Comparisons drop `score` recursively. For `zsh_search` we restrict the
 * comparison to the deterministic top-tier prefix — matches with
 * `score === 1` (exact / resolver / prefix) by `(category, id)` set +
 * order. The fuzzy tier and `matchesTotal` deliberately diverge: Rust's
 * matcher accepts at any positive score, TS's at threshold 0.3.
 *
 * Binary gate: skip the suite (with a banner) when the release binary
 * is missing or its embedded build-input hash differs from the current
 * Rust sources + TS JSON artifacts. No auto-build — the user runs
 * `make cli`. Set BZ_REQUIRE_PARITY=1 to make that gate a hard failure.
 */

import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { loadCorpus } from "@carlwr/zsh-core"
import fc from "fast-check"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { type ToolDef, toolDefs } from "../tool-defs.ts"
import type { SearchResult } from "../tools/search.ts"
import { assertOutputValid } from "./_helpers/ajv.ts"
import { inputArbFor } from "./_helpers/input-arbs.ts"
import { ZshrefBatch } from "./_helpers/zshref-batch.ts"
import { compareZshrefFingerprint } from "./_helpers/zshref-fingerprint.ts"
import { parityToolDefNames } from "./parity-units.ts"

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const repoRoot = join(pkgDir, "..", "..")
const binPath = join(repoRoot, "zshref-rs", "target", "release", "zshref")

let cliBanner = ""
const cliFresh = checkCliFresh()
const parityRequired = process.env.BZ_REQUIRE_PARITY === "1"

function checkCliFresh(): boolean {
  const r = spawnSync(binPath, ["info"], { cwd: repoRoot, encoding: "utf8" })
  if (r.error || r.status === null) {
    cliBanner = `zshref binary missing — run \`make cli\`: ${r.error?.message ?? "unknown"}`
    return false
  }
  if (r.status !== 0) {
    cliBanner = `zshref info failed with exit ${r.status}: ${r.stderr}`
    return false
  }
  try {
    const fp = compareZshrefFingerprint(repoRoot, JSON.parse(r.stdout))
    if (fp.ok) return true
    cliBanner = fp.banner ?? "zshref binary stale — run `make cli`"
  } catch (err) {
    cliBanner = `zshref freshness check failed: ${err instanceof Error ? err.message : String(err)}`
  }
  return false
}

const corpus = loadCorpus()

describe("parity units vs toolDefs", () => {
  test("parity surface lists exactly the shipped tools", () => {
    expect(new Set(parityToolDefNames)).toEqual(
      new Set(toolDefs.map(t => t.name)),
    )
  })
})

interface Case {
  readonly tool: string
  readonly name: string
  readonly input: Readonly<Record<string, unknown>>
}

/** Exact/resolver/prefix cases covering edge behaviors:
 *  NO_*, %number, history !?str?, glob_flag wrapping, multi-category, metadata-only. */
const PINNED_CASES: readonly Case[] = [
  // docs
  { tool: "zsh_docs", name: "auto_cd", input: { key: "AUTO_CD" } },
  { tool: "zsh_docs", name: "no_auto_cd", input: { key: "NO_AUTO_CD" } },
  { tool: "zsh_docs", name: "notify", input: { key: "NOTIFY" } },
  { tool: "zsh_docs", name: "echo", input: { key: "echo" } },
  { tool: "zsh_docs", name: "double_bracket", input: { key: "[[" } },
  { tool: "zsh_docs", name: "no_notify", input: { key: "NO_NOTIFY" } },
  { tool: "zsh_docs", name: "bogus", input: { key: "not-a-real-token" } },
  { tool: "zsh_docs", name: "for_multi_match", input: { key: "for" } },
  {
    tool: "zsh_docs",
    name: "job_spec_template_key",
    input: { key: "%number", category: "job_spec" },
  },
  {
    tool: "zsh_docs",
    name: "builtin_echo",
    input: { key: "echo", category: "builtin" },
  },
  {
    tool: "zsh_docs",
    name: "option_autocd",
    input: { key: "autocd", category: "option" },
  },
  { tool: "zsh_docs", name: "not_an_option", input: { key: "not-an-option" } },
  {
    tool: "zsh_docs",
    name: "history_bang_number",
    input: { key: "!42", category: "history_expn" },
  },
  {
    tool: "zsh_docs",
    name: "history_search",
    input: { key: "!?zsh", category: "history_expn" },
  },
  {
    tool: "zsh_docs",
    name: "glob_flag_wrapped",
    input: { key: "(#i)", category: "glob_flag" },
  },
  {
    tool: "zsh_docs",
    name: "glob_qualifier_extended",
    input: { key: "(#q@)", category: "glob_qualifier" },
  },

  // search
  { tool: "zsh_search", name: "query_printf", input: { query: "printf" } },
  {
    tool: "zsh_search",
    name: "query_echo_builtin_limit_3",
    input: { query: "echo", category: "builtin", limit: 3 },
  },
  { tool: "zsh_search", name: "no_hits", input: { query: "xxyyzz", limit: 5 } },
  {
    tool: "zsh_search",
    name: "limit_zero",
    input: { query: "echo", category: "builtin", limit: 0 },
  },
  {
    tool: "zsh_search",
    name: "history_bang_number",
    input: { query: "!42", category: "history_expn", limit: 3 },
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
    tool: "zsh_list",
    name: "category_reserved_word_limit_5",
    input: { category: "reserved_word", limit: 5 },
  },
  { tool: "zsh_list", name: "limit_zero", input: { limit: 0 } },
]

const NUM_RUNS = Number(process.env.BZ_PARITY_RUNS ?? 500)

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

function topTierKeys(env: SearchResult): string[] {
  return env.matches
    .filter(m => m.score === 1)
    .map(m => `${m.category}\0${m.id}`)
}

/**
 * `zsh_search` parity: compare only the deterministic top-tier prefix
 * (matches with `score === 1`). The fuzzy tier diverges across
 * implementations by design — different scorers and thresholds — and
 * `matchesTotal` is computed pre-truncation, so even when no fuzzy entry
 * reaches `matches`, `matchesTotal` may still differ.
 */
function compareSearch(ts: unknown, rust: unknown): void {
  expect(topTierKeys(rust as SearchResult)).toEqual(
    topTierKeys(ts as SearchResult),
  )
}

function compareEnvelopes(toolName: string, ts: unknown, rust: unknown): void {
  if (toolName === "zsh_search") {
    compareSearch(ts, rust)
  } else {
    expect(stripScores(rust)).toEqual(stripScores(ts))
  }
}

function getTool(name: string): ToolDef {
  const td = toolDefs.find(t => t.name === name)
  if (!td) throw new Error(`unknown tool ${name}`)
  return td
}

if (!cliFresh) {
  console.warn(
    `[parity.test] ${cliBanner}; ${parityRequired ? "failing because BZ_REQUIRE_PARITY=1" : "skipping parity tests"}.`,
  )
}

describe.runIf(cliFresh)("parity: TS execute() vs zshref batch", () => {
  let zsh: ZshrefBatch
  beforeAll(() => {
    zsh = new ZshrefBatch(binPath)
  })
  afterAll(async () => {
    await zsh.close()
  })

  test.each(
    PINNED_CASES.map(c => [`${c.tool}/${c.name}`, c] as const),
  )("pinned: %s", async (_n, c) => {
    const td = getTool(c.tool)
    const tsOutput = td.execute(corpus, c.input)
    const rustOutput = await zsh.call(c.tool, c.input)
    assertOutputValid(td, tsOutput)
    assertOutputValid(td, rustOutput)
    compareEnvelopes(c.tool, tsOutput, rustOutput)
  })

  for (const td of toolDefs) {
    test(`${td.name}: random inputs match (numRuns=${NUM_RUNS})`, async () => {
      await fc.assert(
        fc.asyncProperty(inputArbFor(td.name, corpus), async input => {
          const tsOutput = td.execute(corpus, input)
          const rustOutput = await zsh.call(td.name, input)
          assertOutputValid(td, tsOutput)
          assertOutputValid(td, rustOutput)
          compareEnvelopes(td.name, tsOutput, rustOutput)
        }),
        { numRuns: NUM_RUNS },
      )
    })
  }
})

if (!cliFresh) {
  if (parityRequired) {
    describe("parity gate failed", () => {
      test("BZ_REQUIRE_PARITY=1 requires a fresh zshref binary", () => {
        throw new Error(cliBanner)
      })
    })
  } else {
    describe("parity skipped: see banner", () => {
      test.skip("(WARNING: skipped parity test — see banner)")
    })
  }
}
