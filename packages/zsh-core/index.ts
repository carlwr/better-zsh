/**
 * @packageDocumentation
 * The zsh reference corpus and its data model: the parsed corpus, the doc
 * category ontology (ordered lists, labels, category parsing, record
 * identity, sub-kinds), and the record vocabulary (per-category record
 * types, module names, option-name normalization). Operations on it live
 * in the subpaths.
 */

export type { NonEmpty } from "@carlwr/typescript-extra"
export { docCategoryPreamble } from "./src/docs/category-preamble.ts"
export { type DocCorpus, type DocMap, loadCorpus } from "./src/docs/corpus.ts"
export { normalizeOptName } from "./src/docs/normalize-option.ts"
export {
  classifyOrder,
  type DocCategory,
  type DocRecordId,
  type DocRecordIdOf,
  type DocRecordMap,
  docCategories,
  docCategoryLabels,
  isDocCategory,
  isModuleName,
  type ModuleName,
  moduleNames,
  parseDocCategory,
  parseModuleName,
  subKindOf,
} from "./src/docs/taxonomy.ts"
export * from "./src/docs/types.ts"
