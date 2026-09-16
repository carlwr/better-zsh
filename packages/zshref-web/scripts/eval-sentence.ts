// The curated sentence eval as a report: aggregates only (holdout as the
// overfit watch).

import { evalSentence, renderSentence } from '../nlp/eval/sentence';
import { loadSentenceFixture } from '../nlp/eval/sentence-fixture';
import { reporterAssets, scriptFlags } from './_args';

scriptFlags('eval-sentence', 'pnpm --filter zshref-web nlp:eval-sentence', []);

const assets = await reporterAssets('eval-sentence');
const fixture = await loadSentenceFixture();
process.stdout.write(renderSentence(await evalSentence(fixture, assets)));
