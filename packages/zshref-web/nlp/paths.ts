// Data, model and artifact paths for the Node-side NLP code (scripts and
// tests). Resolved from this file, so callers are cwd-independent.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nlpDir = resolve(pkgDir, 'nlp');

// The editable rules (YAML) with their editor schemas, and the held-out
// sentence fixture (NLP.md).
const rulesDir = resolve(nlpDir, 'rules');
// Committed, generated data (the `UPDATE_*` tests regenerate it) and the
// held-out QA corpus with its editor schema.
const dataDir = resolve(nlpDir, 'data');
// Build output (gitignored): what the SPA fetches under `/artifacts`;
// `scripts/build-index.ts` writes it. The model: `scripts/fetch-model`.
const artifactsDir = resolve(pkgDir, 'static/artifacts');

export const PATHS = {
  tuning: resolve(rulesDir, 'tuning.yaml'),
  stopwords: resolve(rulesDir, 'stopwords.yaml'),
  synonyms: resolve(rulesDir, 'synonyms.yaml'),
  sentenceFixture: resolve(rulesDir, 'sentence-fixture.yaml'),
  rulesSchemaDir: resolve(rulesDir, 'schema'),
  categoriesJson: resolve(dataDir, 'categories.json'),
  lookupMap: resolve(dataDir, 'lookup-map.json'),
  lookupContract: resolve(dataDir, 'lookup-contract.json'),
  parityFixture: resolve(dataDir, 'parity-fixture.json'),
  sanityFixture: resolve(dataDir, 'sanity-fixture.json'),
  qaCorpus: resolve(dataDir, 'nlp-corpus.yaml'),
  qaSchema: resolve(dataDir, 'schema.json'),
  modelDir: resolve(pkgDir, '.aux/model'),
  artifactsDir,
  indexJson: resolve(artifactsDir, 'index.json')
} as const;

// The gitignored inputs — the only PATHS members whose absence is normal, so
// the ones tests gate on. Everything else PATHS reads is committed: its
// absence is a defect and must not resolve to a skip.
export const STAGED = {
  index: PATHS.indexJson,
  model: PATHS.modelDir
} as const;
