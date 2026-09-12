// S4c gate (nlp-move.md §"Before/after gates", row "eval numbers"): the TS
// tune diff in oracle mode against .aux/nlp-move/rust/eval/diff.txt, equal
// at the printed precision. Step tooling, not a test.
//
//   pnpm --filter zshref-web exec tsx <repo>/.reorg-work/gates/tune-diff.mts
//
// Needs: the model (packages/zshref-web/scripts/fetch-model), the staged index
// (pnpm --filter zshref-web build:index) and a capture under .aux/nlp-move/.
//
// The capture's candidate is `BZ_TUNE_BASE=cat=0.02`. Two runs, compared on
// the report lines (`=== tune diff` through the last mover line; cargo's
// lines around them dropped):
//
// - the reporter as shipped (`BZ_TUNE_BASE=cat=0.02 pnpm --filter zshref-web
//   nlp:tune-diff`, TS resolver hit) — informational: the recorded
//   resolver-key mirror gap can move or add a curated mover line; listed,
//   not counted;
// - the gate proper: `renderTuneDiff` in-process with the resolver hit AS
//   RUST COMPUTED IT for every captured query (_capture.mts).
//
// Mover lines print query strings: the curated report is train-split only
// (as Rust's was), so a differing line names a train or mechanical query,
// never a holdout one. The gate also checks that every query the report may
// print is printable ASCII — the precondition under which `rustDebugString`
// and Rust's `{:?}` agree with no escape beyond `\"` and `\\`. Exit 1 on FAIL.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { loadEvalAssets } from "../../packages/zshref-web/nlp/eval/assets.ts"
import {
  composedBase,
  loadBench,
  renderTuneDiff,
} from "../../packages/zshref-web/nlp/eval/sweep.ts"
import {
  evalDir,
  isPrintableAscii,
  listOnly,
  reportSlice,
  rustResolverHit,
  verdict,
  webDir,
} from "./_capture.mts"

const SPEC = "cat=0.02"

const reportLines = (text: string): string[] =>
  reportSlice(
    text,
    l => l === "=== tune diff: base vs candidate ===",
    l => l.startsWith("  "),
  )

const want = reportLines(readFileSync(join(evalDir, "diff.txt"), "utf8"))

// 1. The reporter as shipped.
const shipped = execFileSync(
  "pnpm",
  ["--filter", "zshref-web", "nlp:tune-diff"],
  {
    cwd: webDir,
    env: { ...process.env, BZ_TUNE_BASE: SPEC },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  },
)
listOnly("reporter (TS resolver hit)", want, reportLines(shipped))

// 2. The diff with Rust's captured verdicts.
const assets = await loadEvalAssets()
const bench = await loadBench(
  assets,
  rustResolverHit(assets.corpus),
  console.error,
)
const printable = [
  ...bench.fixture.entries.filter(e => e.split === "train"),
  ...bench.mechEntries,
].map(e => e.query)
const nonAscii = printable.filter(q => !isPrintableAscii(q)).length
console.log(
  `printable queries (train + mechanical): ${printable.length}, not printable ASCII: ${nonAscii}`,
)
const base = assets.rules.tuning
const got = renderTuneDiff(bench, base, composedBase(base, SPEC), SPEC)
verdict("tune-diff", want, reportLines(got))
