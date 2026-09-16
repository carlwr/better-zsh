// Pure ranker math. Inputs are pre-computed (query string, query vector)
// so this module has no embedder / corpus dependency.
//
// Vectors are f32 data (`Float32Array`); the arithmetic is plain doubles.
// Deterministic — the summation orders are fixed — so the parity fixture (a
// golden of this ranker's own past output) pins every score exactly.

import type { Rules } from './rules';
import {
  type Boosts,
  exactWordBoost,
  type IndexedRecord,
  type RankedMatch,
  type RecordText,
  type SemanticScores,
  type Tuning,
  type VectorIndex
} from './types';

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  // Stops at the shorter; in practice both are DIMS-length, so the `?? 0`
  // fallbacks never trigger (i stays in range).
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

export function rank(
  query: string,
  queryVec: Float32Array,
  category: string | null,
  index: VectorIndex,
  rules: Rules
): RankedMatch[] {
  const terms = queryTerms(query.toLowerCase(), rules);
  const penalties = categoryPenalties(index, rules);

  const out: RankedMatch[] = [];
  for (const rec of index.records) {
    if (category !== null && rec.text.category !== category) continue;
    const penalty = penalties.get(rec.text.category) ?? 0;
    out.push(scoreRecord(rec, queryVec, terms, penalty, rules));
  }
  out.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.rec.category !== b.rec.category) return a.rec.category < b.rec.category ? -1 : 1;
    if (a.rec.id !== b.rec.id) return a.rec.id < b.rec.id ? -1 : 1;
    return 0;
  });
  return out;
}

function scoreRecord(
  rec: IndexedRecord,
  queryVec: Float32Array,
  terms: QueryTerms,
  categoryPenalty: number,
  rules: Rules
): RankedMatch {
  const semantic: SemanticScores = {
    structured: dot(queryVec, rec.vectors.structured),
    body: dot(queryVec, rec.vectors.body),
    expanded: dot(queryVec, rec.vectors.expanded)
  };
  const lex = recordTerms(rec.text);
  const b = boosts(lex, terms, rules);

  const [bodyW, structW, expW] = semanticWeights(lex.bodyWords, rules.tuning.semantic_weights);

  const semanticScore = bodyW * semantic.body + structW * semantic.structured + expW * semantic.expanded;
  const score = semanticScore + b.category + b.lexical - categoryPenalty;

  return { rec: rec.text, score, debug: { semantic, boosts: b } };
}

function countWords(s: string): number {
  return s.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * The effective (body, structured, expanded) weights. `expanded` is derived
 * as 1 − body − structured (on the simplex by construction), then mass is
 * shifted body → expanded the shorter the body. Continuous — no threshold
 * cliff.
 */
export function semanticWeights(
  bodyWords: number,
  sw: Tuning['semantic_weights']
): [number, number, number] {
  const { body, structured } = sw;
  const expanded = 1 - body - structured;
  const ramp = Math.max(1 - bodyWords / sw.short_body.length_scale, 0);
  const shift = Math.min(Math.max(sw.short_body.strength * ramp, 0), body);
  return [body - shift, structured, expanded + shift];
}

function categoryPenalty(recordCount: number, maxRecords: number, rules: Rules): number {
  if (maxRecords <= 1) return 0;
  const rarity = 1 - Math.log(Math.max(recordCount, 1)) / Math.log(maxRecords);
  return rules.tuning.penalties.category_rarity_max * clamp01(rarity);
}

function categoryPenalties(index: VectorIndex, rules: Rules): Map<string, number> {
  const counts = new Map<string, number>();
  for (const rec of index.records) {
    counts.set(rec.text.category, (counts.get(rec.text.category) ?? 0) + 1);
  }
  let maxRecords = 0;
  for (const c of counts.values()) if (c > maxRecords) maxRecords = c;
  const out = new Map<string, number>();
  for (const [cat, count] of counts) {
    out.set(cat, categoryPenalty(count, maxRecords, rules));
  }
  return out;
}

// --- lexical inputs ----------------------------------------------------------

/** A record's lexical surface, lowercased where the boosts compare it. */
interface RecordTerms {
  id: string;
  display: string;
  symbolHead: string | null;
  categoryWord: string;
  labelWord: string;
  /** The overlap haystack: every text view of the record. */
  haystack: string;
  bodyWords: number;
}

// A record's terms are a function of its (immutable) text alone, so they
// are derived once per record object and live as long as it does: a
// ranking pass lowercases each record's text once, not once per query.
const recordTermsOf = new WeakMap<RecordText, RecordTerms>();

function recordTerms(rec: RecordText): RecordTerms {
  const memo = recordTermsOf.get(rec);
  if (memo) return memo;
  const display = rec.display.toLowerCase();
  const t: RecordTerms = {
    id: rec.id.toLowerCase(),
    display,
    symbolHead: symbolHead(display),
    categoryWord: rec.category.toLowerCase(),
    labelWord: rec.category_label.toLowerCase(),
    haystack: `${rec.id} ${rec.display} ${rec.structured} ${rec.body} ${rec.expanded}`.toLowerCase(),
    bodyWords: countWords(rec.body)
  };
  recordTermsOf.set(rec, t);
  return t;
}

/** The lowercased query and the token views the boosts read, once per ranking. */
interface QueryTerms {
  q: string;
  words: string[];
  discriminating: string[];
  symbols: string[];
}

function queryTerms(q: string, rules: Rules): QueryTerms {
  const words = significantWords(q, rules);
  return {
    q,
    words,
    discriminating: words.filter((w) => isDiscriminating(w, rules)),
    symbols: symbolTokens(q)
  };
}

// --- boosts ------------------------------------------------------------------

/** The boost terms. `q` is the lowercased query, as `rank` passes it. */
export function computeBoosts(rec: RecordText, q: string, rules: Rules): Boosts {
  return boosts(recordTerms(rec), queryTerms(q, rules), rules);
}

function boosts(lex: RecordTerms, terms: QueryTerms, rules: Rules): Boosts {
  const b = rules.tuning.boosts;
  const category = terms.q.includes(lex.categoryWord) || terms.q.includes(lex.labelWord) ? b.category : 0;
  const wordExact = terms.discriminating.some((w) => w === lex.id || w === lex.display);
  // Symbolic surface match: zsh users name operators and special parameters by
  // their literal symbol ("$?", ">>", "<<<"), which is punctuation, so
  // significantWords drops it. Match those tokens against the record's id and
  // the symbolic head of its display — the punctuation analogue of wordExact.
  const symbolExact = terms.symbols.some((t) => t === lex.id || lex.symbolHead === t);
  const exactWord = wordExact || symbolExact ? exactWordBoost(b) : 0;
  const lexical = exactWord + overlapBoost(wordOverlap(lex.haystack, terms.words), b);
  return { category, lexical };
}

/**
 * Smooth saturating lexical-overlap boost over the overlap count `n`:
 * `scale · n / (n + half_sat)` — monotone, asymptote `scale`, half at
 * `half_sat`.
 */
export function overlapBoost(n: number, b: Tuning['boosts']): number {
  const wo = b.word_overlap;
  return (wo.scale * n) / (n + wo.half_sat);
}

function isDiscriminating(word: string, rules: Rules): boolean {
  if (word.length < rules.tuning.lexical.min_discriminating_word_len) return false;
  const sw = rules.stopwords;
  if (sw.generic.some((s) => s === word)) return false;
  if (sw.discriminating_extra.some((s) => s === word)) return false;
  return true;
}

function wordOverlap(haystack: string, words: readonly string[]): number {
  let count = 0;
  for (const w of words) {
    if (haystack.includes(w)) count++;
  }
  return count;
}

/**
 * Literal symbol tokens in `q`: whitespace tokens that bear punctuation or are
 * `$`-sigiled parameter refs, lowercased, with surrounding quotes and one
 * leading `$` stripped ("$?" -> "?"). Exactly what significantWords discards,
 * yet how zsh names its operators and special parameters.
 */
export function symbolTokens(q: string): string[] {
  const out: string[] = [];
  for (const t of q.split(/\s+/)) {
    if (t.length === 0) continue;
    if (!t.startsWith('$') && !/[^A-Za-z0-9]/.test(t)) continue;
    const trimmed = t.replace(/^['"`]+/, '').replace(/['"`]+$/, '');
    const stripped = (trimmed.startsWith('$') ? trimmed.slice(1) : trimmed).toLowerCase();
    if (stripped.length > 0) out.push(stripped);
  }
  return out;
}

/**
 * Leading run of operator characters in a display form — the symbol before any
 * alphanumeric operand placeholder: ">> word" -> ">>", "?" -> "?",
 * "auto_cd" -> null. Lets a bare-operator query match a sig-shaped record.
 */
export function symbolHead(display: string): string | null {
  const m = display.search(/[A-Za-z0-9 ]/);
  const end = m === -1 ? display.length : m;
  return end > 0 ? display.slice(0, end) : null;
}

function significantWords(s: string, rules: Rules): string[] {
  const min = rules.tuning.lexical.min_significant_word_len;
  const sw = rules.stopwords;
  const out: string[] = [];
  for (const word of s.split(/[^A-Za-z0-9]+/)) {
    if (word.length < min) continue;
    if (sw.generic.some((stop) => stop === word)) continue;
    out.push(word);
  }
  return out;
}
