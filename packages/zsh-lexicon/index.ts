/**
 * @packageDocumentation
 * The zsh reference lexicon and its data model: the parsed lexicon, the doc
 * category ontology (ordered lists, labels, a category guard, record
 * identity), and the record vocabulary (per-category record
 * types, module names, option-name normalization). Operations on it live
 * in the subpaths.
 */

export { docCategoryPreambles } from "./src/docs/category-preamble.ts"
export { type Lexicon, loadLexicon } from "./src/docs/lexicon.ts"
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
