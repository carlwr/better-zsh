// Index-time: the per-record retrieval text views (structured, body,
// expanded) that get embedded. Changes here invalidate the corpus vectors;
// re-embed required.
//
// The record walked here is the JSON projection (`projection.ts`) after a
// `JSON.stringify` round trip (undefined-valued keys gone, key order kept) —
// the same text a JSON consumer of the corpus sees.
// Lowercasing and alphanumeric tests are ASCII-only; whitespace is Unicode
// White_Space.

import { isDefined } from "@carlwr/typescript-extra"
import {
  type DocCategory,
  type DocCorpus,
  docCategoryLabels,
} from "@carlwr/zsh-core"

import type { Synonyms } from "../core/rules"
import { asciiLower } from "../core/text"
import type { RecordText } from "../core/types"
import { projectCorpus } from "./projection"

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }
/** A projected record as JSON (insertion-ordered keys). */
export type JsonRecord = { readonly [key: string]: JsonValue }

/** `synonyms.json` `index_groups`, normalized (trimmed, lowercased) at rules load. */
export type IndexGroups = Synonyms["index_groups"]

/** What the header lines and hints are built from. */
export interface Identity {
  category: DocCategory
  label: string
  id: string
  display: string
  subKind?: string
}

const headerFields: ReadonlySet<string> = new Set([
  "category",
  "id",
  "display",
  "subKind",
])

/** All records in index order: `docCategories` order, corpus map order within. */
export function corpusTexts(
  corpus: DocCorpus,
  indexGroups: IndexGroups,
): RecordText[] {
  return projectCorpus(corpus).flatMap(({ category, records }) =>
    records.map(rec => recordText(category, asJson(rec), indexGroups)),
  )
}

export function recordText(
  cat: DocCategory,
  rec: JsonRecord,
  indexGroups: IndexGroups,
): RecordText {
  const title = strField(rec, "_title")
  const subKind = strField(rec, "subKind")
  const mdBody = strField(rec, "_mdBody")
  const ident: Identity = {
    category: cat,
    label: docCategoryLabels[cat],
    id: strField(rec, "id"),
    display: strField(rec, "display"),
    ...(subKind !== "" ? { subKind } : {}),
  }
  // `_mdBody` is title-less; the body view embeds the whole rendered record.
  const body = bodyText(rec, `${title}\n\n${mdBody}`)
  return {
    category: cat,
    category_label: ident.label,
    id: ident.id,
    display: ident.display,
    ...(subKind !== "" ? { sub_kind: subKind } : {}),
    title,
    md_body: mdBody,
    structured: structuredText(ident, rec),
    body,
    expanded: expandedText(ident, body, indexGroups),
  }
}

/**
 * Header lines, then every record field in emission order; the header's
 * fields, the generated (`_`-prefixed) fields and `desc` skipped.
 */
export function structuredText(ident: Identity, rec: JsonRecord): string {
  const lines = [
    `category: ${ident.label}`,
    `category id: ${ident.category}`,
    `id: ${ident.id}`,
    `display: ${ident.display}`,
    ...(ident.subKind !== undefined ? [`subKind: ${ident.subKind}`] : []),
  ]
  for (const [key, value] of Object.entries(rec)) {
    if (headerFields.has(key) || key.startsWith("_") || key === "desc") continue
    const s = compactValue(value)
    if (s !== undefined) lines.push(`${keyWords(key)}: ${s}`)
  }
  return lines.join("\n")
}

/** `desc` as is when present; else the markdown-stripped `fullMd`. */
export function bodyText(rec: JsonRecord, fullMd: string): string {
  const desc = strField(rec, "desc")
  return desc !== "" ? normalizeWs(desc) : normalizeWs(stripMarkdown(fullMd))
}

/**
 * Hint lines: label, category / id / display words, then for every
 * index-time synonym group with a member in the record (whole word or
 * phrase) its members not already there. Hints keep their case.
 */
export function expandedText(
  ident: Identity,
  body: string,
  indexGroups: IndexGroups,
): string {
  const { category, label, id, display, subKind } = ident
  const hay = asciiLower(
    [category, label, id, display, subKind ?? "", body].join(" "),
  )
  const hints: string[] = []
  const add = (text: string) => {
    const t = normalizeWs(text)
    if (t !== "" && !hints.includes(t)) hints.push(t)
  }
  add(label)
  add(keyWords(category))
  add(keyWords(id))
  add(keyWords(display))
  for (const group of indexGroups) {
    if (group.some(m => hayHasWord(hay, m))) {
      for (const m of group) if (!hayHasWord(hay, m)) add(m)
    }
  }
  return hints.join("\n")
}

/**
 * Whole-word match (or phrase match for needles containing spaces). Single
 * non-alphanumeric ASCII character needles (e.g. "%") use substring match.
 */
export function hayHasWord(hay: string, needle: string): boolean {
  if (needle.includes(" ")) return hay.includes(needle)
  if (
    needle.length === 1 &&
    needle.charCodeAt(0) < 0x80 &&
    !isAsciiAlnum(needle)
  ) {
    return hay.includes(needle)
  }
  const lower = asciiLower(needle)
  return hay.split(/[^0-9A-Za-z]/).some(w => asciiLower(w) === lower)
}

/** A field value on one line, or undefined when there is nothing to say. */
export function compactValue(value: JsonValue): string | undefined {
  if (value === null) return undefined
  if (typeof value === "string") return nonempty(normalizeWs(value))
  if (typeof value === "boolean" || typeof value === "number")
    return String(value)
  if (Array.isArray(value)) {
    return nonempty(value.map(compactValue).filter(isDefined).join(" "))
  }
  const parts: string[] = []
  for (const [k, v] of Object.entries(value)) {
    const s = compactValue(v)
    if (s !== undefined) parts.push(`${keyWords(k)} ${s}`)
  }
  return nonempty(normalizeWs(parts.join(" ")))
}

export const keyWords = (s: string): string => s.replace(/[_-]/g, " ")

export const normalizeWs = (s: string): string => words(s).join(" ")

export const stripMarkdown = (s: string): string => s.replace(/[`*_]/g, "")

// Unicode White_Space; JS `\s` differs at U+0085 and U+FEFF.
const wsRun =
  /[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/

const words = (s: string): string[] => s.split(wsRun).filter(w => w !== "")

const nonempty = (s: string): string | undefined =>
  words(s).length === 0 ? undefined : s

const isAsciiAlnum = (s: string): boolean => /^[0-9A-Za-z]+$/.test(s)

/** A record's string field; `''` when absent or not a string. */
const strField = (rec: JsonRecord, key: string): string => {
  const v = rec[key]
  return typeof v === "string" ? v : ""
}

/** The projected record as its JSON text reads back. */
const asJson = (rec: object): JsonRecord =>
  JSON.parse(JSON.stringify(rec)) as JsonRecord
