// S4c gate (nlp-move.md §"Before/after gates", row "eval numbers"): the TS
// tuning sweep in oracle mode against .aux/nlp-move/rust/eval/sweep.txt (the
// full 12-knob run, recaptured whole before S2), equal at the printed
// precision. Step tooling, not a test.
//
//   pnpm --filter zshref-web exec tsx <repo>/.reorg-work/gates/tune-sweep.mts
//
// Needs: the model (packages/zshref-web/scripts/fetch-model), the staged index
// (pnpm --filter zshref-web build:index) and a capture under .aux/nlp-move/.
//
// One run only — the gate proper, `runSweep` in-process with the resolver hit
// AS RUST COMPUTED IT for every captured query (_capture.mts): seventy-one
// ranking passes over the curated + mechanical sets take over an hour here,
// so the shipped-reporter run of the sibling gates (informational: the
// recorded resolver-key gap) is not repeated. Compared on the report lines
// (`=== tuning sweep` through `=== end sweep ===`; cargo's lines around and
// inside them dropped). The capture ran with no `BZ_TUNE_BASE`. Prints the
// wall time.
//
// Holdout hygiene: report lines are aggregates. Exit 1 on FAIL.

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { loadEvalAssets } from "../../packages/zshref-web/nlp/eval/assets.ts"
import {
  loadBench,
  renderSweep,
  runSweep,
} from "../../packages/zshref-web/nlp/eval/sweep.ts"
import { evalDir, reportSlice, rustResolverHit, verdict } from "./_capture.mts"

const reportLines = (text: string): string[] =>
  reportSlice(
    text,
    l => l === "=== tuning sweep (one knob at a time) ===",
    l => l === "=== end sweep ===",
  )

const want = reportLines(readFileSync(join(evalDir, "sweep.txt"), "utf8"))

const t0 = Date.now()
const assets = await loadEvalAssets()
const bench = await loadBench(
  assets,
  rustResolverHit(assets.corpus),
  console.error,
)
const sweep = runSweep(bench, assets.rules.tuning)
console.log(`sweep wall time: ${((Date.now() - t0) / 60_000).toFixed(1)} min`)
verdict("tune-sweep", want, renderSweep(sweep, "").trim().split("\n"))
