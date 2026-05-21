// MIRRORED-IN: zshref-rs/src/tools/envelope.rs

import { type DocCategory, docCategories } from "@carlwr/zsh-core/taxonomy"
import type { FieldShape } from "../../tool-defs.ts"

const VALID_CATEGORIES: ReadonlySet<string> = new Set(docCategories)

/** Runtime guard for adapter-supplied strings claiming to be a category. */
export function isValidCategory(cat: unknown): cat is DocCategory {
  return typeof cat === "string" && VALID_CATEGORIES.has(cat)
}

/**
 * `required` keys on every envelope schema. Single source of truth for
 * `mkOutputSchema` and the export-artifact drift test.
 */
export const ENVELOPE_REQUIRED_KEYS = [
  "matches",
  "matchesReturned",
  "matchesTotal",
] as const

/** Result envelope: match list + returned/total counts. Rust CLI emits the same shape. */
export interface Envelope<M> {
  readonly matches: readonly M[]
  readonly matchesReturned: number
  readonly matchesTotal: number
}

export function mkEnvelope<M>(
  matches: readonly M[],
  total: number = matches.length,
): Envelope<M> {
  return { matches, matchesReturned: matches.length, matchesTotal: total }
}

export const categoryShape: FieldShape = {
  type: "string",
  enum: [...docCategories],
}
