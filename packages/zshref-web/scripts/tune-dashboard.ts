// The tuning dashboard as a report.

import { rustDebugString } from '../nlp/eval/format';
import { composedBase } from '../nlp/eval/sweep';
import { buildDashboard, renderDashboard } from '../nlp/eval/tune';
import { PRODUCT_FLAG, PRODUCT_USAGE, reporterAssets, scriptFlags } from './_args';

const usage = `\
pnpm --filter zshref-web nlp:tune-dashboard [${PRODUCT_FLAG}] [--fast]

${PRODUCT_USAGE}
  --fast     skip the mechanical layer and the QA (minutes of embedding);
             their rows print as skipped.

  BZ_TUNE_BASE=key=value,…  overrides over the committed tuning (the keys:
             nlp/eval/sweep.ts KNOBS); the report is of that candidate,
             plus its churn against the committed tuning.\
`;
const args = scriptFlags('tune-dashboard', usage, [PRODUCT_FLAG, '--fast']);

const spec = process.env.BZ_TUNE_BASE ?? '';
const candidate = spec.trim() !== '';
if (candidate) process.stdout.write(`[base override] BZ_TUNE_BASE=${rustDebugString(spec)}\n`);

const { assets, resolverHit } = await reporterAssets('tune-dashboard', args);
const tuning = composedBase(assets.rules.tuning, spec);
const dash = await buildDashboard(assets, tuning, { resolverHit, candidate, fast: args.has('--fast') });
process.stdout.write(renderDashboard(dash));
