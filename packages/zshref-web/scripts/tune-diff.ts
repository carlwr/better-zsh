// The item-level tune diff of the committed tuning against the
// `BZ_TUNE_BASE` candidate — the names behind a sweep delta. Holdout is
// never printed (NLP.md).

import { composedBase, loadBench, renderTuneDiff } from "../nlp/eval/sweep"
import { reporterAssets, scriptFlags } from "./_args"

const usage = `\
BZ_TUNE_BASE=key=value,… pnpm --filter zshref-web nlp:tune-diff

  BZ_TUNE_BASE  the candidate (required): overrides over the committed
             tuning; the keys are nlp/eval/sweep.ts KNOBS.\
`
scriptFlags("tune-diff", usage, [])

const spec = process.env.BZ_TUNE_BASE ?? ""
if (spec.trim() === "") {
  console.error(
    "tune-diff: set BZ_TUNE_BASE=<candidate> (key=value,…) to diff against the committed tuning",
  )
  process.exit(2)
}

const assets = await reporterAssets("tune-diff")
const bench = await loadBench(assets, console.error)
const base = assets.rules.tuning
process.stdout.write(
  renderTuneDiff(bench, base, composedBase(base, spec), spec),
)
