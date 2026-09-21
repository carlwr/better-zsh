/**
 * @packageDocumentation
 * The JSON release assets as a TypeScript reader sees them: each record
 * augmented with its rendered markdown body and title (`projectRecords`,
 * the record file), the index that describes it (`JsonIndex`), and the
 * content hash the build stamps on it.
 */

export { corpusDataHash } from "./src/docs/json-artifacts.ts"
export { projectRecords } from "./src/docs/json-projection.ts"
export type {
  JsonCategoryDescriptor,
  JsonDocArrayMap,
  JsonIndex,
  JsonRecordMap,
  JsonSchemaObject,
  WithMarkdown,
} from "./src/docs/json-types.ts"
