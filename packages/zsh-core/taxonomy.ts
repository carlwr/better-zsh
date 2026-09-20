/**
 * @packageDocumentation
 * Doc category ontology: ordered lists, labels, category parsing, record
 * identity types, per-category preambles and sub-kinds.
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
  isDocCategory,
  parseDocCategory,
  subKindOf,
} from "./src/docs/taxonomy.ts"
