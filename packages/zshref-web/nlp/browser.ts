// The app's one door into `nlp/`: what `src/` may import (`$nlp`), and all
// of it — the import fence pins the door, this file its width.

export type { Artifacts } from "./browser/artifacts"
export { getArtifacts } from "./browser/artifacts"
export type { ModelProgress } from "./browser/embedder"
export { onModelProgress } from "./browser/embedder"
export { search } from "./browser/search"
export { categoryCounts } from "./core/rank"
export type { Category, RankedMatch, RecordText } from "./core/types"
export { categoryLabel } from "./core/types"
