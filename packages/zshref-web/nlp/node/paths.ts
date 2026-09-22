// Data, model and artifact paths for the Node-side NLP code (scripts and
// tests). Resolved from this file, so callers are cwd-independent.

import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { ARTIFACT, ARTIFACTS_DIR } from "../core/artifact-files"
import { byRuleFile } from "../core/rules"

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const nlpDir = resolve(pkgDir, "nlp")

// The editable rules (YAML) with their editor schemas, and the held-out
// sentence fixture (NLP.md).
const rulesDir = resolve(nlpDir, "rules")
// Committed, generated data (the `UPDATE_*` tests regenerate it) and the
// held-out QA corpus with its editor schema.
const dataDir = resolve(nlpDir, "data")
// Build output (gitignored): what the SPA fetches under `/artifacts`;
// `scripts/build-index.ts` writes it. The model: `scripts/fetch-model`.
const artifactsDir = resolve(pkgDir, "static", ARTIFACTS_DIR)
// Gitignored, self-maintaining: the model, and the query vectors the
// reporters keep across runs (`query-cache.ts`; delete to reset).
const auxDir = resolve(pkgDir, ".aux")

export const PATHS = {
  pkgDir,
  ...byRuleFile(f => resolve(rulesDir, `${f}.yaml`)),
  sentenceFixture: resolve(rulesDir, "sentence-fixture.yaml"),
  rulesSchemaDir: resolve(rulesDir, "schema"),
  categoriesJson: resolve(dataDir, "categories.json"),
  lookupMap: resolve(dataDir, "lookup-map.json"),
  lookupContract: resolve(dataDir, "lookup-contract.json"),
  parityFixture: resolve(dataDir, "parity-fixture.json"),
  sanityFixture: resolve(dataDir, "sanity-fixture.json"),
  qaCorpus: resolve(dataDir, "nlp-corpus.yaml"),
  qaSchema: resolve(dataDir, "nlp-corpus.schema.json"),
  modelDir: resolve(auxDir, "model"),
  queryCache: resolve(auxDir, "query-cache.json"),
  artifactsDir,
  searchIndex: {
    json: resolve(artifactsDir, ARTIFACT.searchIndex),
    vectors: resolve(artifactsDir, ARTIFACT.searchVectors),
  },
} as const

// The gitignored inputs — the only PATHS members whose absence is normal, so
// the ones tests gate on. Everything else PATHS reads is committed: its
// absence is a defect and must not resolve to a skip. Each entry is every
// file it stands for: gating on one half of a pair would skip silently when
// the other went missing.
export const STAGED = {
  index: Object.values(PATHS.searchIndex),
  /** The half a text-only reader needs; gating such a reader on the blob
   * would skip it in exactly the state its claim is most alive. */
  indexText: [PATHS.searchIndex.json],
  model: [PATHS.modelDir],
} as const
