// Index-time: the per-record retrieval text views (structured, body,
// expanded) that get embedded. Changes here invalidate the corpus vectors;
// re-embed required.
//
// Ported from zshref-rs/src/nlp/retrieval_text.rs. The record walked here is
// the JSON projection as Rust read it (`projection.ts`) after a
// `JSON.stringify` round trip (undefined-valued keys gone, key order kept).
// String handling mirrors Rust's ASCII semantics (`to_ascii_lowercase`,
// `is_ascii_alphanumeric`) and Unicode `char::is_whitespace`.

import type { DocCorpus } from '@carlwr/zsh-core';

import type { RecordText, Synonyms } from '../src/lib/ranker/types';
import { projectCorpus } from './projection';

export type { RecordText } from '../src/lib/ranker/types';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
/** A projected record as JSON: Rust's `Rec` (`serde_json::Map`, insertion-ordered). */
export type JsonRecord = { readonly [key: string]: JsonValue };

/** `synonyms.json` `index_groups`, normalized (trimmed, lowercased) at rules load. */
export type IndexGroups = Synonyms['index_groups'];

/** What the header lines and hints are built from. */
export interface Identity {
  category: string;
  label: string;
  id: string;
  display: string;
  subKind?: string;
}

/** All records in index order: `docCategories` order, corpus map order within. */
export function corpusTexts(corpus: DocCorpus, indexGroups: IndexGroups): RecordText[] {
  return projectCorpus(corpus).flatMap(({ category, records }) =>
    records.map((rec) => recordText(category, asJson(rec), indexGroups))
  );
}

export function recordText(cat: string, rec: JsonRecord, indexGroups: IndexGroups): RecordText {
  const id = strField(rec, '_id');
  const display = strField(rec, '_display');
  const title = strField(rec, '_title');
  const subKind = strField(rec, '_subKind');
  const mdBody = strField(rec, 'mdBody');
  const label = categoryLabel(cat);
  // `mdBody` is title-less; the body view embeds the whole rendered record.
  const body = bodyText(rec, `${title}\n\n${mdBody}`);
  const ident: Identity = {
    category: cat,
    label,
    id,
    display,
    ...(subKind !== '' ? { subKind } : {})
  };
  return {
    category: cat,
    category_label: label,
    id,
    display,
    ...(subKind !== '' ? { sub_kind: subKind } : {}),
    title,
    md_body: mdBody,
    structured: structuredText(ident, rec),
    body,
    expanded: expandedText(ident, body, indexGroups)
  };
}

/** Header lines, then every projected field in emission order. */
export function structuredText(ident: Identity, rec: JsonRecord): string {
  const lines = [
    `category: ${ident.label}`,
    `category id: ${ident.category}`,
    `id: ${ident.id}`,
    `display: ${ident.display}`,
    ...(ident.subKind !== undefined ? [`subKind: ${ident.subKind}`] : [])
  ];
  for (const [key, value] of Object.entries(rec)) {
    if (key.startsWith('_') || key === 'mdBody' || key === 'desc') continue;
    const s = compactValue(value);
    if (s !== undefined) lines.push(`${keyWords(key)}: ${s}`);
  }
  return lines.join('\n');
}

/** `desc` as is when present; else the markdown-stripped `fullMd`. */
export function bodyText(rec: JsonRecord, fullMd: string): string {
  const desc = strField(rec, 'desc');
  return desc !== '' ? normalizeWs(desc) : normalizeWs(stripMarkdown(fullMd));
}

/**
 * Hint lines: label, category / id / display words, then for every
 * index-time synonym group with a member in the record (whole word or
 * phrase) its members not already there. Hints keep their case.
 */
export function expandedText(ident: Identity, body: string, indexGroups: IndexGroups): string {
  const { category, label, id, display, subKind } = ident;
  const hay = asciiLower([category, label, id, display, subKind ?? '', body].join(' '));
  const hints: string[] = [];
  const add = (text: string) => {
    const t = normalizeWs(text);
    if (t !== '' && !hints.includes(t)) hints.push(t);
  };
  add(label);
  add(keyWords(category));
  add(keyWords(id));
  add(keyWords(display));
  for (const group of indexGroups) {
    if (group.some((m) => hayHasWord(hay, m))) {
      for (const m of group) if (!hayHasWord(hay, m)) add(m);
    }
  }
  return hints.join('\n');
}

/**
 * Whole-word match (or phrase match for needles containing spaces). Single
 * non-alphanumeric ASCII character needles (e.g. "%") use substring match.
 */
export function hayHasWord(hay: string, needle: string): boolean {
  if (needle.includes(' ')) return hay.includes(needle);
  if (needle.length === 1 && needle.charCodeAt(0) < 0x80 && !isAsciiAlnum(needle)) {
    return hay.includes(needle);
  }
  const lower = asciiLower(needle);
  return hay.split(/[^0-9A-Za-z]/).some((w) => asciiLower(w) === lower);
}

/**
 * A field value on one line, or undefined when there is nothing to say.
 * Numbers print as serde does; the corpus holds small integers only, where
 * `String(n)` and `Number::to_string` agree.
 */
export function compactValue(value: JsonValue): string | undefined {
  if (value === null) return undefined;
  if (typeof value === 'string') return nonempty(normalizeWs(value));
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(compactValue).filter((s) => s !== undefined && s !== '');
    return nonempty(parts.join(' '));
  }
  const parts: string[] = [];
  for (const [k, v] of Object.entries(value)) {
    const s = compactValue(v);
    if (s !== undefined) parts.push(`${keyWords(k)} ${s}`);
  }
  return nonempty(parts.join(' '));
}

const labelRewrites: ReadonlyMap<string, string> = new Map([
  ['expn', 'expansion'],
  ['subst', 'substitution'],
  ['op', 'operator'],
  ['param', 'parameter']
]);

/**
 * The retrieval-text category label: the id's words with a few tokens
 * spelled out. Not zsh-core's `docCategoryLabels` — the UI shows those; this
 * one is embedded, so switching re-embeds.
 */
export function categoryLabel(cat: string): string {
  return words(keyWords(cat))
    .map((w) => labelRewrites.get(w) ?? w)
    .join(' ');
}

export const keyWords = (s: string): string => s.replace(/[_-]/g, ' ');

export const normalizeWs = (s: string): string => words(s).join(' ');

export const stripMarkdown = (s: string): string => s.replace(/[`*_]/g, '');

// Rust `char::is_whitespace` (Unicode White_Space), behind `split_whitespace`
// and `trim`; JS `\s` differs at U+0085 and U+FEFF.
const wsRun = /[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/;

const words = (s: string): string[] => s.split(wsRun).filter((w) => w !== '');

const nonempty = (s: string): string | undefined => (words(s).length === 0 ? undefined : s);

const asciiLower = (s: string): string => s.replace(/[A-Z]+/g, (m) => m.toLowerCase());

const isAsciiAlnum = (s: string): boolean => /^[0-9A-Za-z]+$/.test(s);

/** A record's string field; `''` when absent or not a string. */
const strField = (rec: JsonRecord, key: string): string => {
  const v = rec[key];
  return typeof v === 'string' ? v : '';
};

/** The projected record as its JSON text reads back: what Rust parsed. */
const asJson = (rec: object): JsonRecord => JSON.parse(JSON.stringify(rec)) as JsonRecord;
