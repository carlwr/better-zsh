// The QA scoring as a report. Prints the hard-check section and the
// summary lines only — the QA set is held out (NLP.md), so no
// per-entry line ever prints.

import { renderQa, runHardChecks, scoreQaSet } from "../nlp/node/eval/qa-score"
import { loadQaSet } from "../nlp/node/eval/qa-set"
import { reporterAssets, scriptFlags } from "./_args"

scriptFlags("qa-score", "pnpm --filter zshref-web nlp:qa-score", [])

const assets = await reporterAssets("qa-score")
const qa = await loadQaSet()
const hard = await runHardChecks(assets)
const scored = await scoreQaSet(qa, assets)
process.stdout.write(renderQa(hard, scored))
