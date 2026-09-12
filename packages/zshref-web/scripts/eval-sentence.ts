// The curated sentence eval as a report: aggregates only — the total, the
// two splits (holdout as the overfit watch) and the per-category breakdown.

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
