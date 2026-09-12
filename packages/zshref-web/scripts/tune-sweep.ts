// The one-knob-at-a-time tuning sweep as a report.

import {
  composedBase,
  KNOB_KEYS,
  loadBench,
  renderKnobBlock,
  renderSweepHeader,
  SWEEP_FOOTER,
  scoreBench,
  sweepKnob
} from '../nlp/eval/sweep';
import { PRODUCT_FLAG, PRODUCT_USAGE, reporterAssets, scriptFlags } from './_args';

const usage = `\
pnpm --filter zshref-web nlp:tune-sweep [${PRODUCT_FLAG}]

${PRODUCT_USAGE}

  BZ_TUNE_BASE=key=value,…  the base to sweep around (the committed tuning
             with these overrides); fold a sweep's best rows in and repeat.\
`;
const args = scriptFlags('tune-sweep', usage, [PRODUCT_FLAG]);

const { assets, resolverHit } = await reporterAssets('tune-sweep', args);
const bench = await loadBench(assets, resolverHit, console.error);
const spec = process.env.BZ_TUNE_BASE ?? '';
const base = composedBase(assets.rules.tuning, spec);
const baseScores = scoreBench(bench, base);
// Block by block: a knob is minutes of ranking, and a partial sweep is still readable.
process.stdout.write(renderSweepHeader(baseScores, spec));
for (const key of KNOB_KEYS) {
  process.stdout.write(renderKnobBlock(sweepKnob(bench, base, key), baseScores.combined));
}
process.stdout.write(SWEEP_FOOTER);
