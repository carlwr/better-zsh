// WEB-MIRROR-OF: zshref-rs/src/nlp/rank.rs
//
// Pure ranker math. Inputs are pre-computed (query string, query vector,
// optional resolver hit) so this module has no embedder / corpus dependency.
//
// f32 math: every floating-point op funnels through Math.fround so the
// score sequence matches Rust's f32 evaluation bit-for-bit. Vector data
// flows through Float32Array so values read back as the exact f32 values
// Rust emitted. The parity-fixture test asserts byte-equality.

import type {
  Boosts,
  IndexedRecord,
  RankedMatch,
  RecordText,
  ResolverHit,
  SemanticScores,
  Tuning,
  VectorIndex
} from './types';
import type { Rules } from './rules';

const f = Math.fround;

function fAdd(...xs: number[]): number {
  // Left-fold matches Rust's `iter().sum::<f32>()` (fold from 0 with `+`).
  let s = 0;
  for (const x of xs) s = f(s + x);
  return s;
}

function fMul(a: number, b: number): number {
  return f(a * b);
}

function fSub(a: number, b: number): number {
  return f(a - b);
}

function fDiv(a: number, b: number): number {
  return f(a / b);
}

function fLn(x: number): number {
  return f(Math.log(x));
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  // Mirrors Rust's `iter().zip()` (stops at the shorter); in practice both are
  // DIMS-length, so the `?? 0` fallbacks never trigger (i stays in range).
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    s = f(s + f((a[i] ?? 0) * (b[i] ?? 0)));
  }
  return s;
}

export function rank(
  query: string,
  queryVec: Float32Array,
  resolverHit: ResolverHit | null,
  category: string | null,
  index: VectorIndex,
  rules: Rules
): RankedMatch[] {
  const q = query.toLowerCase();
  const penalties = categoryPenalties(index, rules);

  const out: RankedMatch[] = [];
  for (const rec of index.records) {
    if (category !== null && rec.text.category !== category) continue;
    const penalty = penalties.get(rec.text.category) ?? 0;
    out.push(scoreRecord(rec, queryVec, q, resolverHit, penalty, rules));
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
  q: string,
  resolverHit: ResolverHit | null,
  categoryPenalty: number,
  rules: Rules
): RankedMatch {
  const semantic: SemanticScores = {
    structured: dot(queryVec, rec.vectors.structured),
    body: dot(queryVec, rec.vectors.body),
    expanded: dot(queryVec, rec.vectors.expanded)
  };
  const b = computeBoosts(rec.text, q, resolverHit, rules);

  const bodyWords = countWords(rec.text.body);
  const [bodyW, structW, expW] = semanticWeights(bodyWords, rules.tuning.semantic_weights);

  const semanticScore = fAdd(
    fMul(bodyW, semantic.body),
    fMul(structW, semantic.structured),
    fMul(expW, semantic.expanded)
  );

  const score = fSub(fAdd(semanticScore, b.category, b.resolver, b.lexical), categoryPenalty);

  return { rec: rec.text, score, debug: { semantic, boosts: b } };
}

function countWords(s: string): number {
  // Mirrors Rust's `str::split_whitespace().count()`.
  return s.split(/\s+/).filter((w) => w.length > 0).length;
}

// Mirror of rank.rs `semantic_weights`.
function semanticWeights(
  bodyWords: number,
  sw: Tuning['semantic_weights']
): [number, number, number] {
  const body = f(sw.body);
  const structured = f(sw.structured);
  const expanded = fSub(fSub(1, body), structured);
  const ramp = Math.max(fSub(1, fDiv(f(bodyWords), f(sw.short_body.length_scale))), 0);
  const shift = Math.min(Math.max(fMul(f(sw.short_body.strength), ramp), 0), body);
  return [fSub(body, shift), structured, fAdd(expanded, shift)];
}

function categoryPenalty(recordCount: number, maxRecords: number, rules: Rules): number {
  if (maxRecords <= 1) return 0;
  const rarity = f(1 - f(fLn(Math.max(recordCount, 1)) / fLn(maxRecords)));
  return fMul(f(rules.tuning.penalties.category_rarity_max), clamp01(rarity));
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

// Mirror of rank.rs `BoostWeights::{exact_word, resolver}`.
function exactWordBoost(b: Tuning['boosts']): number {
  return f(f(b.category) + f(b.exact_word_increment));
}

function resolverBoost(b: Tuning['boosts']): number {
  return f(exactWordBoost(b) + f(b.resolver_increment));
}

function computeBoosts(
  rec: RecordText,
  q: string,
  resolverHit: ResolverHit | null,
  rules: Rules
): Boosts {
  const b = rules.tuning.boosts;
  const categoryWord = rec.category.toLowerCase();
  const labelWord = rec.category_label.toLowerCase();
  const category = q.includes(categoryWord) || q.includes(labelWord) ? f(b.category) : 0;
  const resolver =
    resolverHit && resolverHit.category === rec.category && resolverHit.id === rec.id
      ? resolverBoost(b)
      : 0;
  const id = rec.id.toLowerCase();
  const display = rec.display.toLowerCase();
  const wordExact = significantWords(q, rules)
    .filter((w) => isDiscriminating(w, rules))
    .some((w) => {
      const lw = w.toLowerCase();
      return lw === id || lw === display;
    });
  // Symbolic surface match: zsh users name operators and special parameters by
  // their literal symbol ("$?", ">>", "<<<"), which is punctuation, so
  // significantWords drops it. Match those tokens against the record's id and
  // the symbolic head of its display — the punctuation analogue of wordExact.
  const symbolExact = symbolTokens(q).some((t) => t === id || symbolHead(display) === t);
  const exactWord = wordExact || symbolExact ? exactWordBoost(b) : 0;
  const overlap = f(wordOverlap(rec, q, rules));
  const wo = b.word_overlap;
  // Mirror of rank.rs `overlap_boost`.
  const overlapBoost = fDiv(fMul(f(wo.scale), overlap), fAdd(overlap, f(wo.half_sat)));
  const lexical = f(exactWord + overlapBoost);
  return {
    category,
    resolver,
    lexical
  };
}

function isDiscriminating(word: string, rules: Rules): boolean {
  if (word.length < rules.tuning.lexical.min_discriminating_word_len) return false;
  const lower = word.toLowerCase();
  const sw = rules.stopwords;
  if (sw.generic.some((s) => s === lower)) return false;
  if (sw.discriminating_extra.some((s) => s === lower)) return false;
  return true;
}

function wordOverlap(rec: RecordText, q: string, rules: Rules): number {
  const recText = `${rec.id} ${rec.display} ${rec.structured} ${rec.body} ${rec.expanded}`.toLowerCase();
  let count = 0;
  for (const w of significantWords(q, rules)) {
    if (recText.includes(w)) count++;
  }
  return count;
}

// Mirror of rank.rs `symbol_tokens`.
// Literal symbol tokens in `q`: whitespace tokens that bear punctuation or are
// `$`-sigiled parameter refs, lowercased, with surrounding quotes and one
// leading `$` stripped ("$?" -> "?"). Exactly what significantWords discards,
// yet how zsh names its operators and special parameters.
function symbolTokens(q: string): string[] {
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

// Mirror of rank.rs `symbol_head`.
// Leading run of operator characters in a display form — the symbol before any
// alphanumeric operand placeholder: ">> word" -> ">>", "?" -> "?",
// "auto_cd" -> null. Lets a bare-operator query match a sig-shaped record.
function symbolHead(display: string): string | null {
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
