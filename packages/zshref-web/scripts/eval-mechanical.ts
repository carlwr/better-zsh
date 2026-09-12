// The mechanical sentence eval as a report: the component total with the
// per-category breakdown and #1-violation counts, then the `[combined]`
// blend with the curated fixture's train split. Slow: it embeds every
// mechanical query (thousands).

import { buildMechanical, evalMechanical, renderCombined, renderMechanical } from '../nlp/eval/mechanical';
import { evalSentence } from '../nlp/eval/sentence';
import { loadSentenceFixture } from '../nlp/eval/sentence-fixture';
import { PRODUCT_FLAG, PRODUCT_USAGE, reporterAssets, scriptFlags } from './_args';

const usage = `\
pnpm --filter zshref-web nlp:eval-mechanical [${PRODUCT_FLAG}]

${PRODUCT_USAGE}\
`;
const args = scriptFlags('eval-mechanical', usage, [PRODUCT_FLAG]);

const { assets, resolverHit } = await reporterAssets('eval-mechanical', args);
const mech = await evalMechanical(buildMechanical(assets.corpus), assets, resolverHit);
const curated = await evalSentence(await loadSentenceFixture(), assets, resolverHit);
process.stdout.write(renderMechanical(mech) + renderCombined(curated.train.total, mech.all.total));
