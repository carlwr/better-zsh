// The reporters (scripts/*.ts) as entry points and as pipelines — so none
// can rot unnoticed. Ungated: every tsx script in the manifest, spawned for
// real — arguments are decided before any asset loads. With the staged
// index and model: the report paths the per-module tests do not reach, all
// on one capped bench (the first few entries of every input) so the gated
// suite stays fast. Structure only: no assertion holds a number from a real
// eval, and nothing rendered is printed (NLP.md: no committed scores;
// holdout never printed).

import { execFile } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { withoutFirstSubstring } from "@carlwr/typescript-extra"
import { beforeAll, describe, expect, it } from "vitest"

import { type EvalAssets, loadEvalAssets } from "../../../nlp/node/eval/assets"
import { loadQaCorpus } from "../../../nlp/node/eval/qa-corpus"
import {
  hardChecks,
  renderQa,
  scoreHardChecks,
  scoreQaCorpus,
} from "../../../nlp/node/eval/qa-score"
import {
  type Bench,
  composedBase,
  KNOBS,
  type KnobKey,
  loadBench,
  renderKnobBlock,
  renderSweepHeader,
  renderTuneDiff,
  SWEEP_FOOTER,
  scoreBench,
  sweepKnob,
} from "../../../nlp/node/eval/sweep"
import { buildDashboard, renderDashboard } from "../../../nlp/node/eval/tune"
import { artifactGate, PATHS, STAGED } from "../../_helpers"

const pkgDir = PATHS.pkgDir

// --- entry points --------------------------------------------------------------

const tsxCli = createRequire(import.meta.url).resolve("tsx/cli")

/** The tsx entry points by package script name, from the manifest: a new script is covered by being declared. */
function entryPoints(): [name: string, file: string][] {
  const { scripts } = JSON.parse(
    readFileSync(resolve(pkgDir, "package.json"), "utf8"),
  ) as {
    scripts: Record<string, string>
  }
  return Object.entries(scripts).flatMap(([name, cmd]): [string, string][] => {
    const file = /^tsx (scripts\/[\w-]+\.ts)$/.exec(cmd)?.[1]
    return file ? [[name, file]] : []
  })
}

interface Run {
  status: number
  stdout: string
  stderr: string
}

const runScript = (file: string, args: readonly string[]): Promise<Run> =>
  new Promise((done, fail) => {
    execFile(
      process.execPath,
      [tsxCli, file, ...args],
      { cwd: pkgDir, encoding: "utf8" },
      (err, stdout, stderr) => {
        // A numeric code is the child's exit status; anything else failed to spawn.
        if (err && typeof err.code !== "number") fail(err)
        else
          done({
            status: typeof err?.code === "number" ? err.code : 0,
            stdout,
            stderr,
          })
      },
    )
  })

describe("script entry points", () => {
  const points = entryPoints()

  /** Every script file is a manifest entry (helpers are `_`-prefixed), so none escapes the smoke below. */
  it("the manifest wires every scripts/*.ts", () => {
    const files = readdirSync(resolve(pkgDir, "scripts"))
      .filter(f => /^[^_].*\.ts$/.test(f))
      .map(f => `scripts/${f}`)
      .sort()
    expect(files.length).toBeGreaterThan(0)
    expect(points.map(([, file]) => file).sort()).toEqual(files)
  })

  // One script at a time: a burst of spawns starves the sibling workers.
  it.each(points)(
    "%s: --help prints its usage; an unknown argument exits 2",
    async (name, file) => {
      const [help, unknown] = await Promise.all([
        runScript(file, ["--help"]),
        runScript(file, ["--no-such-flag"]),
      ])
      // stderr is not asserted empty: onnxruntime greets some hosts (an emulated
      // CI container, say) with a cpuid warning on load.
      expect(help.status).toBe(0)
      expect(help.stdout).toContain(`pnpm --filter zshref-web ${name}`)
      expect(unknown).toMatchObject({ status: 2, stdout: "" })
      expect(unknown.stderr).toContain("unknown argument(s): --no-such-flag")
    },
    60_000,
  )
})

// --- over the staged assets ----------------------------------------------------

const skipReason = artifactGate("reporter smokes", [
  ...STAGED.index,
  ...STAGED.model,
])

/** Entries per input in the smoke bench: enough for embed → rank → score → render, not the hundreds. */
const CAP = 8
const SPEC = "cat=0.02"

const NUM = String.raw`\d\.\d{3}`
const NUM4 = String.raw`\d\.\d{4}`

describe("reporters over the staged assets, capped", () => {
  let assets: EvalAssets
  let bench: Bench

  beforeAll(async () => {
    if (skipReason) return
    assets = await loadEvalAssets()
    bench = await loadBench(assets, () => {}, CAP)
  }, 180_000)

  it("the dashboard, full tier", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    const tuning = composedBase(assets.rules.tuning, SPEC)
    const dash = await buildDashboard(assets, tuning, {
      candidate: true,
      cap: CAP,
    })
    expect(dash.sentence.nEntries).toBe(CAP)
    expect(dash.mechanical?.nEntries).toBe(CAP)
    expect(dash.churn?.mechanical).not.toBeNull()
    for (const v of [
      ...(dash.components.mech ?? []),
      dash.qa?.avgPercent,
      dash.qa?.hardPercent,
    ]) {
      expect(Number.isFinite(v)).toBe(true)
    }

    const text = renderDashboard(dash)
    const lines = text.split("\n")
    expect(text).not.toContain("NaN")
    expect(text).not.toContain("skipped")
    expect(lines[1]).toBe("=== nlp tuning dashboard ===")
    expect(lines[2]).toMatch(
      new RegExp(
        `^\\[sentence\\]  all=${NUM}  train=${NUM}  holdout=${NUM}  \\(${CAP} entries\\)$`,
      ),
    )
    expect(lines[3]).toMatch(/^\[sanity\] \d\/\d hold {2}floor≥/)
    expect(lines[4]).toMatch(/^\[contract\] \d+ bare entries, \d+ failures$/)
    expect(lines[5]).toMatch(
      new RegExp(`^\\[mechanical\\] ${NUM}  \\(${CAP} entries\\)$`),
    )
    expect(lines[6]).toMatch(
      new RegExp(
        `^\\[combined\\]  λ·train \\+ \\(1−λ\\)·mech = ${NUM}·${NUM} \\+ ${NUM}·${NUM} = ${NUM}$`,
      ),
    )
    const churnRows = lines.filter(l =>
      / moved │ +\d+ fail→pass +\d+ pass→fail │ Σgain Δ [+-]\d\.\d{3} \(net\)$/.test(
        l,
      ),
    )
    expect(churnRows.map(l => l.trim().split(/ {2,}/)[0])).toEqual([
      "curated train",
      "mechanical",
    ])
    const ablationRows = lines.filter(l =>
      new RegExp(`^  \\S+ +${NUM} +${NUM} +${NUM}$`).test(l),
    )
    expect(ablationRows.map(l => l.trim().split(/ +/)[0])).toEqual([
      "cur.train",
      "cur.hold",
      "mechanical",
    ])
    // Two box tables: per category, then the hard slices.
    expect(lines.filter(l => /^┌[─┬]+┐$/.test(l))).toHaveLength(2)
    expect(lines.filter(l => /^└[─┴]+┘$/.test(l))).toHaveLength(2)
    const catRows = lines.filter(l =>
      /^│ \S+ +│ +(\d\.\d{3}|—) │ +(\d\.\d{3}|—) │ +(\d\.\d{3}|—) │ +(\d\.\d{3}|—) │ +(\d+|—) │ +(\d+|—) │$/.test(
        l,
      ),
    )
    expect(catRows.length).toBeGreaterThan(0)
    expect(catRows).toHaveLength(
      new Set([
        ...dash.sentence.all.perCategory.keys(),
        ...(dash.mechanical?.all.perCategory.keys() ?? []),
      ]).size,
    )
    const sliceRows = lines.filter(l =>
      /^│ (id length \d|punctuation-only) +│ +\d\.\d{3} │ +\d+\/\d+ │$/.test(l),
    )
    expect(sliceRows).toHaveLength(dash.mechanical?.slices.length ?? -1)
    expect(lines.at(-2)).toMatch(
      /^\[qa\] avg -?\d+\.\d%, hard-check score \d+\.\d% \(held-out — never tune on this\)$/,
    )
    expect(lines.at(-1)).toBe("")
  }, 300_000)

  it("the sweep, as the reporter composes it", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    const base = assets.rules.tuning
    const baseScores = scoreBench(bench, base)
    // One float knob, one int knob.
    const knobs: KnobKey[] = ["cat", "sig_len"]
    const text =
      renderSweepHeader(baseScores, "") +
      knobs
        .map(k =>
          renderKnobBlock(sweepKnob(bench, base, k), baseScores.combined),
        )
        .join("") +
      SWEEP_FOOTER
    const lines = text.split("\n")
    expect(text).not.toContain("NaN")
    expect(lines.slice(0, 2)).toEqual([
      "",
      "=== tuning sweep (one knob at a time) ===",
    ])
    expect(lines[2]).toMatch(
      new RegExp(
        `^base: combined=${NUM4}  train=${NUM4}  holdout=${NUM4}  mechanical=${NUM4}  \\(BZ_TUNE_BASE=""\\)$`,
      ),
    )
    expect(
      lines.filter(l => l.startsWith("── ")).map(l => l.split(" ")[1]),
    ).toEqual(knobs)
    const rows = lines.filter(l => l.startsWith("  "))
    expect(rows).toHaveLength(
      knobs.reduce((n, k) => n + KNOBS[k].points.length, 0),
    )
    for (const row of rows) {
      expect(row).toMatch(
        new RegExp(
          `^ {2}\\S+ +comb=${NUM4} Δ=[+-]${NUM4}  train=${NUM4} hold=${NUM4} mech=${NUM4}( ◄ best| \\(base\\))?$`,
        ),
      )
    }
    expect(lines.filter(l => l.endsWith(" ◄ best"))).toHaveLength(knobs.length)
    expect(text.endsWith(SWEEP_FOOTER)).toBe(true)
  }, 120_000)

  it("the diff of a candidate", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    const base = assets.rules.tuning
    const text = renderTuneDiff(bench, base, composedBase(base, SPEC), SPEC)
    const lines = text.split("\n")
    expect(text).not.toContain("NaN")
    expect(lines.slice(0, 3)).toEqual([
      "",
      "=== tune diff: base vs candidate ===",
      `candidate BZ_TUNE_BASE="${SPEC}"`,
    ])
    const trainEntries = bench.curated.entries.filter(e => e.split === "train")
    const trainItems = trainEntries.reduce((n, e) => n + e.want.length, 0)
    const heads = lines.filter(l => l.startsWith("["))
    expect(heads[0]).toMatch(
      new RegExp(
        `^\\[curated train\\] ${trainItems} items, \\d+ moved rank; depth-crossings: \\d+ fail→pass, \\d+ pass→fail; Σgain Δ=[+-]${NUM} \\(flat per-item, not category-normalized\\)$`,
      ),
    )
    expect(heads[1]).toMatch(new RegExp(`^\\[mechanical\\] ${CAP} items, `))
    expect(heads).toHaveLength(2)
    // Holdout stays out: every mover names a train or a mechanical query.
    const printable = new Set(
      [...trainEntries, ...bench.mechanical.entries].map(e => e.query),
    )
    const movers = lines.filter(l => l.includes("  q="))
    for (const l of movers) {
      expect(l).toMatch(
        /^ {2}[+-]\d\.\d{3} {2}rank +\d+→\d+ +\S+\/\S+ {2}q="[^"]*"( ⬆PASS| ⬇FAIL)?$/,
      )
      const q = JSON.parse(
        l.slice(l.indexOf("q=") + 2).replace(/ (⬆PASS|⬇FAIL)$/, ""),
      ) as string
      expect(printable.has(q)).toBe(true)
    }
  }, 120_000)

  it("the QA report, with its summary JSON", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    const hard = await scoreHardChecks(
      hardChecks(assets.corpus).slice(0, CAP),
      assets,
    )
    const qa = await loadQaCorpus()
    const scored = await scoreQaCorpus(
      { ...qa, entries: qa.entries.slice(0, CAP) },
      assets,
    )
    const text = renderQa(hard, scored)
    const lines = text.split("\n")
    expect(text).not.toContain("NaN")
    expect(lines[0]).toBe("=== Hard checks (per-category self-retrieval) ===")
    expect(lines.filter(l => l.startsWith("  FAIL: "))).toHaveLength(
      CAP - hard.passed,
    )
    const rates = lines.filter(l => /^ +\d+\.\d% {2}\S+ \(\d+\/\d+\)$/.test(l))
    expect(rates).toHaveLength(Object.keys(hard.perCat).length)
    expect(lines).toContain(`Entries: ${CAP}`)
    expect(
      lines.filter(l =>
        /^Hard-check score \(category-weighted\): \d+\.\d%/.test(l),
      ),
    ).toHaveLength(2)
    const summary = lines.at(-2)
    expect(summary).toMatch(/^SUMMARY_JSON \{/)
    const parsed = JSON.parse(
      withoutFirstSubstring("SUMMARY_JSON ", summary ?? ""),
    ) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(["avgPercent", "hardPercent"])
    for (const v of Object.values(parsed)) expect(Number.isFinite(v)).toBe(true)
    expect(lines.at(-1)).toBe("")
  }, 120_000)
})
