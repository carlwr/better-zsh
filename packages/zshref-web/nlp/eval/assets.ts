// What every eval and reporter needs loaded once: corpus, rules, lookup map,
// embedder, index. A missing or stale index is built in memory (minutes) and
// never written — `pnpm build:index` is the way to persist one; a missing
// model is an error, since nothing here can run without it.

import { existsSync } from 'node:fs';

import { type DocCorpus, loadCorpus } from '@carlwr/zsh-core';

import { LookupIndex, LookupMapSchema } from '../../src/lib/ranker/lookup-map';
import type { Rules } from '../../src/lib/ranker/rules';
import type { VectorIndex } from '../../src/lib/ranker/types';
import { createNodeEmbedder, type Embedder } from '../embedder-node';
import { buildIndex, readIndex, validateIndex } from '../index-build';
import { buildLookupMap } from '../lookup-map-build';
import { PATHS } from '../paths';
import { loadRulesYaml } from '../rules-load';

export interface EvalAssets {
  corpus: DocCorpus;
  rules: Rules;
  lookup: LookupIndex;
  embedder: Embedder;
  index: VectorIndex;
}

export function assetsMissing(): string[] {
  return [PATHS.modelDir].filter((p) => !existsSync(p));
}

/** The on-disk index when it is an index of this corpus; null when missing or stale. */
async function validIndexOnDisk(corpus: DocCorpus, rules: Rules): Promise<VectorIndex | null> {
  if (!existsSync(PATHS.indexJson)) return null;
  const index = await readIndex(PATHS.indexJson);
  return validateIndex(index, corpus, rules).ok ? index : null;
}

export async function loadEvalAssets(): Promise<EvalAssets> {
  const missing = assetsMissing();
  if (missing.length > 0) {
    throw new Error(`NLP assets missing: ${missing.join(', ')} — run scripts/fetch-model`);
  }
  const corpus = loadCorpus();
  const rules = await loadRulesYaml();
  const lookup = new LookupIndex(LookupMapSchema.parse(buildLookupMap(corpus)));
  const embedder = await createNodeEmbedder();
  const index = (await validIndexOnDisk(corpus, rules)) ?? (await buildIndex({ corpus, rules, embedder }));
  return { corpus, rules, lookup, embedder, index };
}
