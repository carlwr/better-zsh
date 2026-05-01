/**
 * @packageDocumentation
 * Doc category ontology: ordered lists, labels, record identity helpers,
 * per-category preambles, and per-category subKind enumerations.
 */

export { docCategoryPreamble } from "./src/docs/category-preamble.ts"
export { subKindEnums } from "./src/docs/corpus.ts"
export {
  classifyOrder,
  type DocCategory,
  type DocPieceId,
  type DocRecordMap,
  docCategories,
  docCategoryLabels,
  docDisplay,
  docSubKind,
  mkPieceId,
} from "./src/docs/taxonomy.ts"
