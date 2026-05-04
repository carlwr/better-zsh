// MIRRORED-IN: zshref-rs/src/tools/envelope.rs

import {
  classifyOrder,
  type DocCategory,
  docCategories,
  docCategoryLabels,
} from "@carlwr/zsh-core/taxonomy"
import type { PropertySpec } from "../../tool-defs.ts"

const VALID_CATEGORIES: ReadonlySet<string> = new Set(docCategories)

/** Runtime guard for adapter-supplied strings claiming to be a category. */
export function isValidCategory(cat: unknown): cat is DocCategory {
  return typeof cat === "string" && VALID_CATEGORIES.has(cat)
}

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

/** The categories in classify-order, rendered with explanations and a heading  */
function renderCategoryList(): string {
  const cats = classifyOrder
  const width = Math.max(...cats.map(c => c.length))
  const fmt = (c: DocCategory) =>
    `  ${c.padEnd(width)}      ${docCategoryLabels[c]}`
  const heading = "  value\n  -----"
  return `${heading}\n${cats.map(fmt).join("\n")}`
}

export const inputSchemaCategory: PropertySpec = {
  type: "string",
  enum: [...docCategories],
  description: `Restrict to one doc category. At most one match will be returned.\n\nIf omitted, all categories are tried, in the order given below. There will be at most one match per category.\n\nValid values:\n\n${renderCategoryList()}`,
}

export const briefCategory = "restrict to one category"
