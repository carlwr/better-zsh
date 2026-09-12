// The curated sentence eval as a report (NLP.md §"Eval architecture", layer
// B): aggregates only — the total, the two splits (holdout as an
// overfit-watch, never a tuning target) and the per-category breakdown.
// Asset-gated like the Rust reporter: the model must be fetched
// (scripts/fetch-model); a missing index is built in memory.

import { evalSentence, renderSentence } from '../nlp/eval/sentence';
import { loadSentenceFixture } from '../nlp/eval/sentence-fixture';
import { PRODUCT_FLAG, PRODUCT_USAGE, reporterAssets, scriptFlags } from './_args';

const usage = `\
pnpm --filter zshref-web nlp:eval-sentence [${PRODUCT_FLAG}]

${PRODUCT_USAGE}\
`;
const args = scriptFlags('eval-sentence', usage, [PRODUCT_FLAG]);

const { assets, resolverHit } = await reporterAssets('eval-sentence', args);
const fixture = await loadSentenceFixture();
process.stdout.write(renderSentence(await evalSentence(fixture, assets, resolverHit)));
