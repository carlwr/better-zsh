// What every eval and reporter needs loaded once (`EvalAssets`); the
// embedder keeps query vectors across runs (`query-cache.ts`). A missing or
// stale index is built in memory (about a minute) and never written —
// `pnpm build:index` is the way to persist one; a missing model is an error,
// since nothing here can run without it.

import { existsSync } from "node:fs"

import { type Lexicon, loadLexicon } from "@carlwr/zsh-lexicon"

import {
  type LookupIndex,
  LookupMapSchema,
  lookupIndex,
} from "../../core/lookup-map"
import type { Rules } from "../../core/rules"
import type { VectorIndex } from "../../core/types"
import {
  createNodeEmbedder,
  type Embedder,
  embedderIdentity,
} from "../embedder-node"
import { buildIndex, readIndex, validateIndex } from "../index-build"
import { buildLookupMap } from "../lookup-map-build"
import { PATHS } from "../paths"
import { cachedEmbedder } from "../query-cache"
import { loadRulesYaml } from "../rules-load"

export interface EvalAssets {
  lexicon: Lexicon
  rules: Rules
  lookup: LookupIndex
  embedder: Embedder
  index: VectorIndex
}

/** Null with the model staged; else why nothing can run, with the fix. */
export const modelMissing = (): string | null =>
  existsSync(PATHS.modelDir)
    ? null
    : `no model at ${PATHS.modelDir} — run scripts/fetch-model`

/** The on-disk index when it is an index of this lexicon; null when missing or stale. */
async function validIndexOnDisk(
  lexicon: Lexicon,
  rules: Rules,
): Promise<VectorIndex | null> {
  if (Object.values(PATHS.searchIndex).some(p => !existsSync(p))) return null
  // Unreadable counts as absent, as in `scripts/build-index.ts`: a torn or
  // truncated pair falls back to the in-memory build, it does not kill the
  // reporter.
  const index = await readIndex(PATHS.searchIndex).catch(() => null)
  return index && validateIndex(index, lexicon, rules).ok ? index : null
}

export async function loadEvalAssets(): Promise<EvalAssets> {
  const missing = modelMissing()
  if (missing) throw new Error(missing)
  const lexicon = loadLexicon()
  const rules = await loadRulesYaml()
  const lookup = lookupIndex(LookupMapSchema.parse(buildLookupMap(lexicon)))
  const raw = await createNodeEmbedder()
  const index =
    (await validIndexOnDisk(lexicon, rules)) ??
    (await buildIndex({ lexicon, rules, embedder: raw }))
  const embedder = cachedEmbedder(raw, PATHS.queryCache, embedderIdentity())
  return { lexicon, rules, lookup, embedder, index }
}
