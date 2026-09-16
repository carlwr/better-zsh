// The mechanical sentence eval as a report. Slow: it embeds every
// mechanical query (thousands).

import {
  buildMechanical,
  evalMechanical,
  renderCombined,
  renderMechanical,
} from "../nlp/eval/mechanical"
import { evalSentence } from "../nlp/eval/sentence"
import { loadSentenceFixture } from "../nlp/eval/sentence-fixture"
import { reporterAssets, scriptFlags } from "./_args"

scriptFlags(
  "eval-mechanical",
  "pnpm --filter zshref-web nlp:eval-mechanical",
  [],
)

const assets = await reporterAssets("eval-mechanical")
const mech = await evalMechanical(buildMechanical(assets.corpus), assets)
const curated = await evalSentence(await loadSentenceFixture(), assets)
process.stdout.write(
  renderMechanical(mech) + renderCombined(curated.train.total, mech.all.total),
)
