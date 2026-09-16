// The QA harness scoring as a report. Prints the hard-check section and the
// summary lines only — the QA corpus is a held-out set (NLP.md), so no
// per-entry line ever prints.

import { loadQaCorpus } from '../nlp/eval/qa-corpus';
import { renderQa, runHardChecks, scoreQaCorpus } from '../nlp/eval/qa-score';
import { PRODUCT_FLAG, PRODUCT_USAGE, reporterAssets, scriptFlags } from './_args';

const usage = `\
pnpm --filter zshref-web nlp:qa-score [${PRODUCT_FLAG}]

${PRODUCT_USAGE}\
`;
const args = scriptFlags('qa-score', usage, [PRODUCT_FLAG]);

const { assets, resolverHit } = await reporterAssets('qa-score', args);
const corpus = await loadQaCorpus();
const hard = await runHardChecks(assets, resolverHit);
const scored = await scoreQaCorpus(corpus, assets, resolverHit);
process.stdout.write(renderQa(hard, scored));
