// The tuning dashboard as a report.

import { composedBase } from "../nlp/node/eval/sweep"
import { buildDashboard, renderDashboard } from "../nlp/node/eval/tune"
import { reporterAssets, scriptFlags, tuneBaseSpec } from "./_args"

const usage = `\
pnpm --filter zshref-web nlp:tune-dashboard [--fast]

  --fast     skip the mechanical layer and the QA (most of the run: both
             embed thousands of queries); their rows print as skipped.

  BZ_TUNE_BASE=key=value,…  overrides over the committed tuning (the keys:
             nlp/node/eval/sweep.ts KNOBS); the report is of that candidate,
             plus its churn against the committed tuning.\
`
const args = scriptFlags("tune-dashboard", usage, ["--fast"])

const spec = tuneBaseSpec()
const candidate = spec.trim() !== ""
if (candidate)
  process.stdout.write(`[base override] BZ_TUNE_BASE=${JSON.stringify(spec)}\n`)

const assets = await reporterAssets("tune-dashboard")
const tuning = composedBase(assets.rules.tuning, spec)
const dash = await buildDashboard(assets, tuning, {
  candidate,
  fast: args.has("--fast"),
})
process.stdout.write(renderDashboard(dash))
