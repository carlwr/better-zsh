#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readFileSync } from "node:fs"
import YAML from "yaml"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "../../..")

function usage(code = 1) {
  const stream = code === 0 ? process.stdout : process.stderr
  stream.write(
    [
      "Usage: run-qa.mjs [--zshref PATH] [--corpus PATH] [--skip-hard]",
      "",
      "  --zshref PATH   Path to zshref binary (default: target/release/zshref)",
      "  --corpus PATH   Path to NLP QA corpus YAML (default: <script-dir>/nlp-corpus.yaml)",
      "  --skip-hard     Skip auto-generated hard checks",
      "  --help, -h      Show this help",
    ].join("\n") + "\n"
  )
  process.exit(code)
}

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {
    zshref: resolve(repoRoot, "zshref-rs/target/release/zshref"),
    corpus: resolve(__dirname, "nlp-corpus.yaml"),
    skipHard: false,
  }
  let i = 0
  const takeValue = (flag) => {
    const value = args[++i]
    if (!value || value.startsWith("--")) {
      console.error(`${flag} requires a value`)
      usage()
    }
    return resolve(value)
  }
  for (; i < args.length; i++) {
    switch (args[i]) {
      case "--zshref":
        opts.zshref = takeValue("--zshref")
        break
      case "--corpus":
        opts.corpus = takeValue("--corpus")
        break
      case "--skip-hard":
        opts.skipHard = true
        break
      case "--help":
      case "-h":
        usage(0)
        break
      default:
        console.error(`Unknown arg: ${args[i]}`)
        usage()
    }
  }
  return opts
}

function batch(zshref, requests, timeout = 120_000) {
  const input = requests.map((r) => JSON.stringify(r)).join("\n") + "\n"
  const proc = spawnSync(zshref, ["batch"], {
    encoding: "utf8",
    input,
    maxBuffer: 256 * 1024 * 1024,
    timeout,
  })
  if (proc.error) {
    throw new Error(`zshref batch failed to run: ${proc.error.message}`)
  }
  if (proc.status !== 0) {
    throw new Error(
      `zshref batch failed: ${proc.stderr?.trimEnd() || "(no stderr)"}`
    )
  }

  return proc.stdout
    .trimEnd()
    .split("\n")
    .filter(Boolean)
    .map((line, i) => {
      let response
      try {
        response = JSON.parse(line)
      } catch {
        throw new Error(`zshref batch response ${i + 1} is invalid JSON`)
      }
      if (!response.ok) {
        throw new Error(
          `zshref batch request ${i + 1} failed: ${response.error ?? "unknown error"}`
        )
      }
      return response.output
    })
}

/** Get all records (id + user-facing display) for a category. */
function categoryRecords(zshrefBin, cat) {
  const [r] = batch(zshrefBin, [
    { tool: "zsh_list", input: { category: cat, limit: 10000 } },
  ])
  return r.matches.map((m) => ({ id: m.id, display: m.display ?? m.id }))
}

/** Hard checks: mechanically-synthesized self-retrieval. For each record of a
 * suitable category, a templated question using the record's DISPLAY form (what
 * a user types, e.g. AUTO_CD not autocd) must return that record as #1.
 * Templates use the canonical category word, so the check tests category+id
 * retrieval, not phrasing. Excluded: categories whose ids carry signatures or
 * punctuation (redirection, glob_*, arith_op, param_expn*, prompt_escape,
 * history_expn, …) where a templated question is meaningless, and the large,
 * uncommon zle_widget set (would dominate the totals). */
function hardChecks(zshrefBin) {
  const formats = [
    { category: "builtin", template: (d) => `what does the ${d} builtin do` },
    { category: "special_param", template: (d) => `what is the ${d} parameter` },
    { category: "option", template: (d) => `what does the ${d} option do` },
    { category: "reserved_word", template: (d) => `what does the ${d} reserved word do` },
    { category: "mathfunc", template: (d) => `what does the ${d} math function do` },
    { category: "comp_utility", template: (d) => `what does the ${d} completion function do` },
  ]

  const results = { passed: 0, failed: 0, details: [], perCat: {} }
  const checks = []

  for (const { category, template } of formats) {
    const recs = categoryRecords(zshrefBin, category)
    checks.push(
      ...recs.map((r) => ({
        category,
        id: r.id,
        query: template(r.display),
      }))
    )
  }

  const requests = checks.map((check) => ({
    tool: "nlp_search",
    input: { query: check.query, limit: 1 },
  }))
  let outputs = []
  try {
    outputs = batch(zshrefBin, requests, 300_000)
  } catch (e) {
    for (const check of checks) {
      results.failed++
      results.details.push(`  ERROR: "${check.query}" → ${e.message}`)
    }
    return results
  }

  for (const [i, check] of checks.entries()) {
    const top = outputs[i].matches?.[0]
    const pc = (results.perCat[check.category] ??= { passed: 0, total: 0 })
    pc.total++
    if (top && top.category?.id === check.category && top.id === check.id) {
      results.passed++
      pc.passed++
    } else {
      const got = top ? `${top.category?.id ?? "?"}/${top.id}` : "(no results)"
      results.failed++
      results.details.push(
        `  FAIL: "${check.query}" → got ${got}, expected ${check.category}/${check.id}`
      )
    }
  }

  return results
}

/** Scored queries from YAML corpus. */
function scoredQueries(zshrefBin, corpus) {
  const summary = []
  let totalWeightedScore = 0
  let totalExpectedWeight = 0
  let warnings = 0

  const responses = batch(
    zshrefBin,
    corpus.entries.map((entry) => ({
      tool: "nlp_search",
      input: {
        query: entry.query,
        limit: entry.limit ?? 20,
        ...(entry.category ? { category: entry.category } : {}),
      },
    })),
    300_000
  )

  for (const [entryIndex, entry] of corpus.entries.entries()) {
    const { query, expected } = entry
    const limit = entry.limit ?? 20
    const topN = entry.topN ?? limit
    const weight = entry.weight ?? 1.0

    const r = responses[entryIndex]
    const matches = r.matches ?? []
    const scorable = matches.slice(0, topN)
    const seen = new Set()

    let entryScore = 0
    let entryExpectedWeight = 0

    for (const exp of expected) {
      const key = `${exp.category}/${exp.id}`
      const matchIdx = scorable.findIndex(
        (m) => m.category?.id === exp.category && m.id === exp.id
      )
      const absW = Math.abs(exp.score) * weight
      entryExpectedWeight += absW

      if (exp.score < 0) {
        if (matchIdx === -1) {
          entryScore += absW
        } else {
          entryScore += exp.score * weight
          if (!process.env.QUIET_WARN) {
            console.warn(
              `WARN: "${query}" unexpected ${key} in top ${topN}`
            )
          }
          warnings++
        }
        continue
      }

      if (matchIdx === -1) {
        if (!process.env.QUIET_WARN) {
          console.warn(
            `WARN: "${query}" expected ${key} (score ${exp.score}) not in top ${topN}`
          )
        }
        warnings++
        continue
      }
      if (seen.has(key)) {
        if (!process.env.QUIET_WARN) {
          console.warn(`WARN: "${query}" duplicate expected ${key}`)
        }
        continue
      }
      seen.add(key)
      entryScore += exp.score * weight
    }

    totalWeightedScore += entryScore
    totalExpectedWeight += entryExpectedWeight

    summary.push({
      query,
      entryScore,
      entryExpectedWeight,
      numMatched: seen.size,
    })
  }

  return { summary, totalWeightedScore, totalExpectedWeight, warnings }
}

function main() {
  const opts = parseArgs()

  // --- Hard checks ---
  // Headline metric is the mean of per-category pass rates (each category
  // weighted equally), so it is insensitive to how many records a category has
  // and to adding/removing categories.
  const hard = opts.skipHard ? null : hardChecks(opts.zshref)
  let hardScore = null
  if (hard) {
    console.log("=== Hard checks (per-category self-retrieval) ===")
    for (const d of hard.details) console.log(d)
    console.log()
    const rates = Object.keys(hard.perCat)
      .sort()
      .map((c) => {
        const { passed, total } = hard.perCat[c]
        return { c, pct: total ? (passed / total) * 100 : 0, passed, total }
      })
    for (const r of rates) {
      console.log(`  ${`${r.pct.toFixed(1)}%`.padStart(6)}  ${r.c} (${r.passed}/${r.total})`)
    }
    hardScore = rates.length ? rates.reduce((a, r) => a + r.pct, 0) / rates.length : 0
    console.log()
    console.log(
      `Hard-check score (category-weighted): ${hardScore.toFixed(1)}%  (${hard.passed}/${hard.passed + hard.failed} raw)`
    )
    console.log()
  }

  // --- Scored queries ---
  const yamlSrc = readFileSync(opts.corpus, "utf8")
  const corpus = YAML.parse(yamlSrc)
  if (!corpus || !Array.isArray(corpus.entries)) {
    console.error("Corpus must have an 'entries' array")
    process.exit(1)
  }

  console.log("=== Scored queries ===")
  const scored = scoredQueries(opts.zshref, corpus)

  for (const s of scored.summary) {
    const pct =
      s.entryExpectedWeight > 0
        ? ((s.entryScore / s.entryExpectedWeight) * 100).toFixed(1)
        : "N/A"
    console.log(
      `${pct}%`.padStart(7),
      `[${s.numMatched}]`,
      s.query.slice(0, 55).padEnd(55)
    )
  }

  const avgScore =
    scored.totalExpectedWeight > 0
      ? scored.totalWeightedScore / scored.totalExpectedWeight
      : 0

  console.log()
  console.log(
    `Average score: ${(avgScore * 100).toFixed(1)}%  (${scored.totalWeightedScore.toFixed(2)} / ${scored.totalExpectedWeight.toFixed(2)})`
  )
  console.log(`Entries: ${corpus.entries.length}`)
  console.log(`Warnings: ${scored.warnings}`)
  if (hard) {
    console.log(`Hard-check score (category-weighted): ${hardScore.toFixed(1)}%`)
  }

  // Machine-readable summary for the Rust tuning dashboard (tune.rs::run_qa).
  // A stable contract decoupled from the human-formatted lines above, so
  // reformatting the prose can't silently break the dashboard's parse.
  console.log(
    `SUMMARY_JSON ${JSON.stringify({
      avgPercent: +(avgScore * 100).toFixed(1),
      hardPercent: hard ? +hardScore.toFixed(1) : null
    })}`
  )
}

main()
