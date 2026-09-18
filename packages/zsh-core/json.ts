/**
 * @packageDocumentation
 * JSON projection of corpus records: each record augmented with its rendered
 * markdown body and identity fields, as JSON consumers see it; and the
 * content hash the JSON build stamps on its index.
 */

export { corpusDataHash } from "./src/docs/json-artifacts.ts"
export { projectRecords } from "./src/docs/json-projection.ts"
export type {
  JsonDocArrayMap,
  JsonRecordMap,
  WithMarkdown,
} from "./src/docs/json-types.ts"
