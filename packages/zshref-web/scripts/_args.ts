// Argument handling and the asset preamble shared by the tsx entry points
// beside this file. Arguments are decided before any asset loads — `--help`
// and a refused argument cost no model — so tests/nlp/reporters.test.ts
// spawns every script ungated.

import { assetsMissing, type EvalAssets, loadEvalAssets } from '../nlp/eval/assets';
import { corpusResolverHit, noResolverHit, type ResolverHitSource } from '../nlp/oracle';

/** The mode flag every reporter takes, and its usage paragraph: one wording. */
export const PRODUCT_FLAG = '--product';
export const PRODUCT_USAGE = `\
  ${PRODUCT_FLAG}  no resolver hit, as the SPA ranks. Default: the corpus
             resolver's hit, as the recorded oracle captures had it.\
`;

/**
 * The flags given, or the process exits: `--help` prints `usage` (exit 0);
 * an argument outside `known` is refused with a note on stderr (exit 2).
 */
export function scriptFlags(name: string, usage: string, known: readonly string[]): ReadonlySet<string> {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help') || args.has('-h')) {
    process.stdout.write(`${usage}\n`);
    process.exit(0);
  }
  const unknown = [...args].filter((a) => !known.includes(a));
  if (unknown.length > 0) {
    console.error(`${name}: unknown argument(s): ${unknown.join(' ')}`);
    process.exit(2);
  }
  return args;
}

/**
 * A reporter's preamble: the assets (a missing model exits 1 with the fetch
 * hint, before anything loads) and the resolver-hit source `flags` select.
 */
export async function reporterAssets(
  name: string,
  flags: ReadonlySet<string>
): Promise<{ assets: EvalAssets; resolverHit: ResolverHitSource }> {
  const missing = assetsMissing();
  if (missing.length > 0) {
    console.error(`${name}: missing ${missing.join(', ')} — run scripts/fetch-model`);
    process.exit(1);
  }
  const assets = await loadEvalAssets();
  return { assets, resolverHit: flags.has(PRODUCT_FLAG) ? noResolverHit : corpusResolverHit(assets.corpus) };
}
