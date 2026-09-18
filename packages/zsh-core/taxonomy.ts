/**
 * @packageDocumentation
 * Doc category ontology: ordered lists, labels, category parsing, record
 * identity and lookup helpers, per-category preambles, and per-category
 * subKind enumerations.
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
  mkRecordId,
  parseDocCategory,
  recordOf,
  type SubKindEnums,
  subKindEnums,
  subKindOf,
} from "./src/docs/taxonomy.ts"
