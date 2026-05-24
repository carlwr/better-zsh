/**
 * @packageDocumentation
 * Markdown rendering and reference-dump helpers for zsh-core doc records.
 */

export type { DocCorpus } from "./src/docs/corpus.ts"
export * from "./src/render/dump.ts"
export {
  type DocHead,
  headFor,
  recordTitle,
  renderDoc,
  renderDocWithTitle,
  renderRecord,
  renderRecordWithTitle,
} from "./src/render/md.ts"
export * from "./src/render/refs.ts"
