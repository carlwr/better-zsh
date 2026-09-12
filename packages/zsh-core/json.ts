/**
 * @packageDocumentation
 * JSON projection of corpus records: each record augmented with its rendered
 * markdown body and identity fields, as JSON consumers see it.
 */

export {
  assertAsciiIdentity,
  augmentWithMarkdown,
} from "./src/docs/json-projection.ts"
export type {
  JsonDocArrayMap,
  JsonRecordMap,
  WithMarkdown,
} from "./src/docs/json-types.ts"
