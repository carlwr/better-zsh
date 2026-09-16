// The QA scoring as a report. Prints the hard-check section and the
// summary lines only — the QA corpus is a held-out set (NLP.md), so no
// per-entry line ever prints.

import { loadQaCorpus } from "../nlp/node/eval/qa-corpus"
import {
  renderQa,
  runHardChecks,
  scoreQaCorpus,
} from "../nlp/node/eval/qa-score"
import { reporterAssets, scriptFlags } from "./_args"

scriptFlags("qa-score", "pnpm --filter zshref-web nlp:qa-score", [])

const assets = await reporterAssets("qa-score")
const corpus = await loadQaCorpus()
const hard = await runHardChecks(assets)
const scored = await scoreQaCorpus(corpus, assets)
process.stdout.write(renderQa(hard, scored))
