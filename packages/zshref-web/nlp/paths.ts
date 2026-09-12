// Data, model and artifact paths for the Node-side NLP code (scripts and
// tests). Resolved from this file, so callers are cwd-independent.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(pkgDir, '..', '..');

// Transitional: rules, fixtures and the QA corpus still live in the Rust
// tree, which `include_str!`s the YAML and is the oracle while the TS port
// lands; they move into this package when the Rust nlp module is deleted.
const zshrefRs = resolve(repoRoot, 'zshref-rs');
const rulesDir = resolve(zshrefRs, 'src/nlp/rules');
const qaDir = resolve(zshrefRs, 'tests/nlp-qa');
// Build output (gitignored): what the SPA fetches under `/artifacts`;
// `scripts/build-index.ts` writes it. The model: `scripts/fetch-model`.
const artifactsDir = resolve(pkgDir, 'static/artifacts');

export const PATHS = {
  tuning: resolve(rulesDir, 'tuning.yaml'),
  stopwords: resolve(rulesDir, 'stopwords.yaml'),
  synonyms: resolve(rulesDir, 'synonyms.yaml'),
  sentenceFixture: resolve(rulesDir, 'sentence-fixture.yaml'),
  rulesSchemaDir: resolve(rulesDir, 'schema'),
  categoriesJson: resolve(qaDir, 'categories.json'),
  lookupMap: resolve(qaDir, 'lookup-map.json'),
  lookupContract: resolve(qaDir, 'lookup-contract.json'),
  parityFixture: resolve(qaDir, 'parity-fixture.json'),
  sanityFixture: resolve(qaDir, 'sanity-fixture.json'),
  qaCorpus: resolve(qaDir, 'nlp-corpus.yaml'),
  qaSchema: resolve(qaDir, 'schema.json'),
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
