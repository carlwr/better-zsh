/**
 * @packageDocumentation
 * Doc category ontology: ordered lists, labels, category parsing, record
 * identity and display, per-category preambles and sub-kinds.
 */

export { docCategoryPreamble } from "./src/docs/category-preamble.ts"
export {
  classifyOrder,
  type DocCategory,
  type DocRecordId,
  type DocRecordIdOf,
  type DocRecordMap,
  docCategories,
  docCategoryLabels,
  docDisplay,
  idOf,
  isDocCategory,
  parseDocCategory,
  subKindOf,
} from "./src/docs/taxonomy.ts"
