// The artifact files by name, relative to the artifacts root: `/artifacts`
// in the SPA, `static/artifacts` on disk (`pnpm build:index` writes them).

import type { RuleFile } from "./rules"

export const ARTIFACTS_DIR = "artifacts"

export const ARTIFACT = {
  index: "index.json",
  categories: "categories.json",
  lookupMap: "lookup-map.json",
} as const

/** The emitted JSON of one rule file. */
export const ruleArtifact = (f: RuleFile): string => `rules/${f}.json`
