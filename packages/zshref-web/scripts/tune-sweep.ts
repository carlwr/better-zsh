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
import { reporterAssets, scriptFlags } from './_args';

const usage = `\
pnpm --filter zshref-web nlp:tune-sweep

  BZ_TUNE_BASE=key=value,…  the base to sweep around (the committed tuning
             with these overrides); fold a sweep's best rows in and repeat.

Takes over an hour on CPU (every knob point re-ranks the mechanical set);
prints block by block, so a partial run is still readable.\
`;
scriptFlags('tune-sweep', usage, []);

const assets = await reporterAssets('tune-sweep');
const bench = await loadBench(assets, console.error);
const spec = process.env.BZ_TUNE_BASE ?? '';
const base = composedBase(assets.rules.tuning, spec);
const baseScores = scoreBench(bench, base);
// Block by block, so a partial sweep is still readable.
process.stdout.write(renderSweepHeader(baseScores, spec));
for (const key of KNOB_KEYS) {
  process.stdout.write(renderKnobBlock(sweepKnob(bench, base, key), baseScores.combined));
}
process.stdout.write(SWEEP_FOOTER);
