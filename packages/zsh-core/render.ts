/**
 * @packageDocumentation
 * Markdown rendering for zsh-core doc records.
 */

export { projectRecords } from "./src/docs/json-projection.ts"
export type { WithMarkdown } from "./src/docs/json-types.ts"
export {
  categoryFooter,
  type DocHead,
  type RenderedRecord,
  renderRecord,
} from "./src/render/md.ts"
