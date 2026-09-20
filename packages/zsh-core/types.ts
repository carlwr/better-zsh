/**
 * @packageDocumentation
 * Public zsh-core domain types and record vocabulary (module names,
 * option-name normalization).
 */

export type { NonEmpty } from "@carlwr/typescript-extra"
export { normalizeOptName } from "./src/docs/normalize-option.ts"
export {
  isModuleName,
  type ModuleName,
  moduleNames,
  parseModuleName,
} from "./src/docs/taxonomy.ts"
export * from "./src/docs/types.ts"
