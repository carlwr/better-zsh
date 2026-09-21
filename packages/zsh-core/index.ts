/**
 * @packageDocumentation
 * The zsh reference corpus and its data model: the parsed corpus, the doc
 * category ontology (ordered lists, labels, a category guard, record
 * identity), and the record vocabulary (per-category record
 * types, module names, option-name normalization). Operations on it live
 * in the subpaths.
 */

export { docCategoryPreamble } from "./src/docs/category-preamble.ts"
export { type DocCorpus, loadCorpus } from "./src/docs/corpus.ts"
export { normalizeOptName } from "./src/docs/normalize-option.ts"
export {
  classifyOrder,
  type DocCategory,
  type DocRecord,
  type DocRecordMap,
  docCategories,
  docCategoryLabels,
  isDocCategory,
  type ModuleName,
  moduleNames,
} from "./src/docs/taxonomy.ts"
export * from "./src/docs/types.ts"
