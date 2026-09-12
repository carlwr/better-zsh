// S4c gate (nlp-move.md §"Before/after gates", row "eval numbers"): the TS
// tuning dashboard in oracle mode against .aux/nlp-move/rust/eval/
// dashboard.txt, equal at the printed precision. Step tooling, not a test.
//
//   pnpm --filter zshref-web exec tsx <repo>/.reorg-work/gates/tune-dashboard.mts
//
// Needs: the model (packages/zshref-web/scripts/fetch-model), the staged index
// (pnpm --filter zshref-web build:index) and a capture under .aux/nlp-move/.
//
// Two runs, compared on the report lines (`=== nlp tuning dashboard ===`
// through the `[qa]` line; cargo's lines around them dropped). The capture
// ran with no `BZ_TUNE_BASE` (no `[base override]` line, the no-candidate
// churn line), full tier:
//
// - the reporter as shipped (`pnpm --filter zshref-web nlp:tune-dashboard`,
//   TS resolver hit) — informational: the recorded resolver-key mirror gap
//   moves the lines the two affected train queries feed; listed, not counted;
// - the gate proper: `buildDashboard` in-process with the resolver hit AS
//   RUST COMPUTED IT for every captured query (_capture.mts); the rest —
//   the held-out QA corpus among them, never captured — keep the TS hit, as
//   the qa-score gate did.
//
// Holdout hygiene: report lines are aggregates. Exit 1 on FAIL.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { loadEvalAssets } from "../../packages/zshref-web/nlp/eval/assets.ts"
import {
  buildDashboard,
  renderDashboard,
} from "../../packages/zshref-web/nlp/eval/tune.ts"
import {
  evalDir,
  listOnly,
  reportSlice,
  rustResolverHit,
  verdict,
  webDir,
} from "./_capture.mts"

const reportLines = (text: string): string[] =>
  reportSlice(
    text,
    l => l === "=== nlp tuning dashboard ===",
    l => l.startsWith("[qa] "),
  )

const want = reportLines(readFileSync(join(evalDir, "dashboard.txt"), "utf8"))

// 1. The reporter as shipped.
const shipped = execFileSync(
  "pnpm",
  ["--filter", "zshref-web", "nlp:tune-dashboard"],
  {
    cwd: webDir,
    env: { ...process.env, BZ_TUNE_BASE: "" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  },
)
listOnly("reporter (TS resolver hit)", want, reportLines(shipped))

// 2. The dashboard with Rust's captured verdicts.
const assets = await loadEvalAssets()
const dash = await buildDashboard(assets, assets.rules.tuning, {
  resolverHit: rustResolverHit(assets.corpus),
  candidate: false,
})
verdict("tune-dashboard", want, renderDashboard(dash).trim().split("\n"))
