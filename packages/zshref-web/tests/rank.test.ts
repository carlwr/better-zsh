// The ranker on its own merits: the unit tests inherited from the port, then
// properties over small synthetic indexes (records with hand-made text and
// `syntheticVec` vectors, the committed rules and mutated copies). The
// parity fixture pins the arithmetic against its past; these pin what the
// arithmetic must mean.

import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';

import { syntheticVec } from '../nlp/fixtures';
import { loadRulesYaml } from '../nlp/rules-load';
import {
  computeBoosts,
  overlapBoost,
  rank,
  semanticWeights,
  symbolHead,
  symbolTokens
} from '../src/lib/ranker/rank';
import type { Rules } from '../src/lib/ranker/rules';
import {
  derivedBoosts,
  type IndexedRecord,
  type RecordText,
  type ResolverHit,
  type Tuning,
  type VectorIndex
} from '../src/lib/ranker/types';
import { makeRecordText } from './_fixtures';

const f = Math.fround;

let rules: Rules;
beforeAll(async () => {
  rules = await loadRulesYaml();
});

type SemanticWeights = Tuning['semantic_weights'];
type BoostWeights = Tuning['boosts'];

const withTuning = (r: Rules, patch: (t: Tuning) => Tuning): Rules => ({ ...r, tuning: patch(r.tuning) });

// Semantic weights with a fixed length_scale of 10.
const sw = (body: number, structured: number, strength: number): SemanticWeights => ({
  body,
  structured,
  short_body: { strength, length_scale: 10 }
});

const near = (got: number, want: number): void => {
  expect(Math.abs(got - want)).toBeLessThan(1e-6);
};

const rec = (over: Partial<RecordText>): RecordText =>
  makeRecordText({ category: 'option', category_label: 'option', title: '', md_body: '', ...over });

describe('ranker unit tests', () => {
  it('exact_id_match_gives_lexical_boost', () => {
    const r = rec({ id: 'autocd', display: 'AUTO_CD' });
    const exact = computeBoosts(r, 'autocd', null, rules);
    const queryWithCategory = computeBoosts(r, 'option autocd please', null, rules);
    // Both queries contain the discriminating word "autocd" and get the
    // exact-word boost, so lexical scores can be equal.
    expect(exact.lexical).toBeGreaterThan(0);
    expect(queryWithCategory.category).toBeGreaterThan(0);
  });

  it('symbol_tokens_strip_sigil_and_keep_operators', () => {
    expect(symbolTokens('the $? param')).toEqual(['?']);
    expect(symbolTokens('redirection >>')).toEqual(['>>']);
    expect(symbolTokens('$0')).toEqual(['0']); // sigiled even if alnum after strip
    expect(symbolTokens('list all background jobs')).toEqual([]);
  });

  it('symbol_head_is_the_operator_prefix', () => {
    expect(symbolHead('>> word')).toBe('>>');
    expect(symbolHead('?')).toBe('?');
    expect(symbolHead('auto_cd')).toBeNull(); // leading alnum -> no symbol head
  });

  it('symbol_query_matches_param_and_operator_records', () => {
    const param = rec({ category: 'special_param', category_label: 'special parameter', id: '?', display: '?' });
    const redir = { ...param, category: 'redirection', id: '>>_word', display: '>> word' };
    // "$?" names the `?` param; ">>" names `>>_word` via its display's
    // symbolic head — both fire the lexical boost. A prose word does not.
    expect(computeBoosts(param, 'the $? param', null, rules).lexical).toBeGreaterThan(0);
    expect(computeBoosts(redir, 'redirection >>', null, rules).lexical).toBeGreaterThan(0);
    expect(computeBoosts(param, 'list background jobs', null, rules).lexical).toBe(0);
  });

  it('semantic_weights_derive_expanded', () => {
    // expanded = 1 − body − structured; the triple sums to 1 by construction.
    const [b, s, e] = semanticWeights(1000, sw(0.7, 0.2, 0));
    near(b, 0.7);
    near(s, 0.2);
    near(e, 0.1);
    near(b + s + e, 1);
  });

  it('short_body_shift_is_continuous_with_exact_endpoints', () => {
    const w = sw(0.7, 0.2, 0.1);
    // L ≥ length_scale: base mix, no shift.
    near(semanticWeights(10, w)[0], 0.7);
    // L = 0: full strength shift body → expanded (the old short-body triple).
    const z = semanticWeights(0, w);
    near(z[0], 0.6);
    near(z[1], 0.2);
    near(z[2], 0.2);
    // Strictly monotone across the ramp — no discontinuity.
    const a = semanticWeights(2, w)[0];
    const b = semanticWeights(7, w)[0];
    expect(0.6 < a && a < b && b < 0.7).toBe(true);
  });

  it('boosts_are_reliability_ordered', () => {
    const b = rules.tuning.boosts;
    const eff = derivedBoosts(b);
    expect(f(b.category)).toBeLessThanOrEqual(eff.exactWord);
    expect(eff.exactWord).toBeLessThanOrEqual(eff.resolver);
  });

  it('overlap_boost_saturates_monotonically', () => {
    const b = rules.tuning.boosts;
    expect(overlapBoost(0, b)).toBe(0);
    const one = overlapBoost(1, b);
    const many = overlapBoost(100, b);
    expect(one > 0 && one < many).toBe(true);
    // Smooth saturation never reaches the asymptote.
    expect(many).toBeLessThan(b.word_overlap.scale);
  });

  it('prose_overlap_beats_broad_name_containment', () => {
    const aliases = rec({
      id: 'aliases',
      display: 'ALIASES',
      structured: 'id: aliases',
      body: 'Expand aliases.'
    });
    const complete = {
      ...aliases,
      id: 'completealiases',
      display: 'COMPLETE_ALIASES',
      body: 'Prevents aliases before completion is attempted.',
      structured: 'id: completealiases'
    };
    // Query has more discriminating words in complete's body/structured
    // than in aliases's — overlap should favour complete.
    const q = 'prevents expansion before completion';
    expect(computeBoosts(complete, q, null, rules).lexical).toBeGreaterThan(
      computeBoosts(aliases, q, null, rules).lexical
    );
  });
});

// --- synthetic indexes -------------------------------------------------------

const CATEGORIES = [
  { category: 'option', category_label: 'option' },
  { category: 'builtin', category_label: 'builtin' },
  { category: 'special_param', category_label: 'special parameter' }
];
const IDENTITIES = [
  { id: 'aliases', display: 'ALIASES' },
  { id: 'autocd', display: 'AUTO_CD' },
  { id: 'setopt', display: 'setopt' },
  { id: 'echo', display: 'echo' },
  { id: '?', display: '?' },
  { id: '>>_word', display: '>> word' }
];
// Discriminating words, stopwords (`that`, `with`), category names, a
// too-short word, and the symbols the lexical path special-cases.
const WORDS = [
  'alias', 'expand', 'glob', 'history', 'prompt', 'complete', 'redirect', 'file', 'output',
  'that', 'with', 'option', 'builtin', 'special', 'parameter', 'autocd', 'setopt', 'to',
  '$?', '>>', '"$0"', '<<<'
];

const arbText = (max: number): fc.Arbitrary<string> =>
  fc.array(fc.constantFrom(...WORDS), { maxLength: max }).map((ws) => ws.join(' '));

const arbQuery: fc.Arbitrary<string> = fc
  .tuple(arbText(6), fc.string({ unit: 'grapheme-ascii', maxLength: 6 }))
  .map(([words, noise]) => `${words} ${noise}`);

const arbRecord: fc.Arbitrary<IndexedRecord> = fc
  .record({
    cat: fc.constantFrom(...CATEGORIES),
    ident: fc.constantFrom(...IDENTITIES),
    structured: arbText(6),
    body: arbText(30),
    expanded: arbText(6)
  })
  .map(({ cat, ident, structured, body, expanded }) => {
    const vec = (view: string) => syntheticVec([cat.category, ident.id, view]);
    return {
      text: rec({ ...cat, ...ident, structured, body, expanded }),
      vectors: { structured: vec('structured'), body: vec('body'), expanded: vec('expanded') }
    };
  });

// Identities unique, as in a real index: the sort is total only then.
const arbIndex: fc.Arbitrary<VectorIndex> = fc
  .uniqueArray(arbRecord, {
    minLength: 1,
    maxLength: 7,
    selector: (r) => `${r.text.category}\0${r.text.id}`
  })
  .map((records) => ({
    version: 2,
    model: 'synthetic',
    dims: records[0]?.vectors.body.length ?? 0,
    normalized: true,
    corpus_hash: 'synthetic',
    records
  }));

// A query, its synthetic vector, and a resolver hit on one of the index's
// records or none.
const arbRanking = fc
  .record({ index: arbIndex, query: arbQuery, hitAt: fc.option(fc.nat(), { nil: null }) })
  .map(({ index, query, hitAt }) => {
    const hitRec = hitAt === null ? null : index.records[hitAt % index.records.length];
    const hit: ResolverHit | null = hitRec ? { category: hitRec.text.category, id: hitRec.text.id } : null;
    return { index, query, queryVec: syntheticVec(['query', query]), hit };
  });

const countWords = (s: string): number => s.split(/\s+/).filter((w) => w.length > 0).length;

const INDEX_RUNS = { numRuns: 60 };

describe('rank properties', () => {
  it('category filter ≡ rank-then-filter, penalties from the full index', () => {
    // A non-zero rarity penalty is what makes the two differ if the filtered
    // run counted only its own category.
    const penalized = withTuning(rules, (t) => ({ ...t, penalties: { category_rarity_max: 0.1 } }));
    fc.assert(
      fc.property(arbRanking, fc.constantFrom(...CATEGORIES.map((c) => c.category), 'nope'), (r, cat) => {
        const all = rank(r.query, r.queryVec, r.hit, null, r.index, penalized);
        const filtered = rank(r.query, r.queryVec, r.hit, cat, r.index, penalized);
        expect(filtered).toEqual(all.filter((m) => m.rec.category === cat));
      }),
      INDEX_RUNS
    );
  });

  it('is invariant under a permutation of the index records', () => {
    const arb = arbRanking.chain((r) =>
      fc
        .shuffledSubarray(r.index.records, { minLength: r.index.records.length })
        .map((records) => ({ ...r, shuffled: { ...r.index, records } }))
    );
    fc.assert(
      fc.property(arb, (r) => {
        expect(rank(r.query, r.queryVec, r.hit, null, r.shuffled, rules)).toEqual(
          rank(r.query, r.queryVec, r.hit, null, r.index, rules)
        );
      }),
      INDEX_RUNS
    );
  });

  it('score = Σ debug parts, f32 in the ranker’s association order', () => {
    // The rarity penalty is the one score term outside `debug`; off, so the
    // parts account for the whole score whatever the committed knob says.
    const noPenalty = withTuning(rules, (t) => ({ ...t, penalties: { category_rarity_max: 0 } }));
    fc.assert(
      fc.property(arbRanking, (r) => {
        for (const m of rank(r.query, r.queryVec, r.hit, null, r.index, noPenalty)) {
          const [bw, sw, ew] = semanticWeights(countWords(m.rec.body), noPenalty.tuning.semantic_weights);
          const { semantic, boosts } = m.debug;
          let s = 0;
          for (const x of [f(bw * semantic.body), f(sw * semantic.structured), f(ew * semantic.expanded)]) {
            s = f(s + x);
          }
          let score = 0;
          for (const x of [s, boosts.category, boosts.resolver, boosts.lexical]) score = f(score + x);
          expect(m.score).toBe(score);
        }
      }),
      INDEX_RUNS
    );
  });

  it('lexical boosts are casing-invariant for an ASCII query', () => {
    const recase = (q: string, flips: boolean[]): string =>
      [...q].map((c, i) => (flips[i % flips.length] ? c.toUpperCase() : c.toLowerCase())).join('');
    fc.assert(
      fc.property(arbRanking, fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }), (r, flips) => {
        expect(rank(recase(r.query, flips), r.queryVec, r.hit, null, r.index, rules)).toEqual(
          rank(r.query, r.queryVec, r.hit, null, r.index, rules)
        );
      }),
      INDEX_RUNS
    );
  });
});

// --- weights and boosts ------------------------------------------------------

const unit = fc.double({ min: 0, max: 1, noNaN: true });

// f32 values with structured ≤ 1 − body exactly, as the range check admits.
const arbSemanticWeights: fc.Arbitrary<SemanticWeights> = fc
  .record({
    body: unit.map(f),
    frac: unit,
    strength: unit.map(f),
    length_scale: fc.double({ min: 1, max: 100, noNaN: true }).map(f)
  })
  .map(({ body, frac, strength, length_scale }) => ({
    body,
    structured: f(f(1 - body) * frac),
    short_body: { strength, length_scale }
  }));

const arbBodyWords = fc.nat({ max: 200 });

// Boost weights on a 1e-3 grid: an increment that small is still many f32
// ulps at these magnitudes, so "> 0" means "strictly larger" after rounding.
const grid = (max: number): fc.Arbitrary<number> => fc.integer({ min: 0, max: max * 1000 }).map((i) => i / 1000);
const arbBoostWeights: fc.Arbitrary<BoostWeights> = fc.record({
  category: grid(0.3),
  exact_word_increment: grid(0.1),
  resolver_increment: grid(0.1),
  word_overlap: fc.record({ scale: grid(0.5), half_sat: fc.integer({ min: 1, max: 16 }) })
});

describe('semantic weight properties', () => {
  it('lie on the simplex: non-negative, summing to 1 within f32 eps', () => {
    fc.assert(
      fc.property(arbSemanticWeights, arbBodyWords, (w, n) => {
        const [b, s, e] = semanticWeights(n, w);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(e).toBeGreaterThanOrEqual(0);
        expect(Math.abs(b + s + e - 1)).toBeLessThanOrEqual(1e-6);
      })
    );
  });

  it('short-body shift: exact endpoints, monotone, no jump beyond the ramp slope', () => {
    fc.assert(
      fc.property(arbSemanticWeights, arbBodyWords, (w, n) => {
        const base = semanticWeights(Number.MAX_SAFE_INTEGER, w);
        // At or past length_scale the base mix is exact; at 0 the full
        // strength moves body → expanded, capped by body.
        expect(semanticWeights(Math.ceil(w.short_body.length_scale), w)).toEqual(base);
        const shift = Math.min(w.short_body.strength, w.body);
        expect(semanticWeights(0, w)).toEqual([f(w.body - shift), w.structured, f(base[2] + shift)]);
        const [b0, s0, e0] = semanticWeights(n, w);
        const [b1, s1, e1] = semanticWeights(n + 1, w);
        expect(b1).toBeGreaterThanOrEqual(b0);
        expect(s1).toBe(s0);
        expect(e1).toBeLessThanOrEqual(e0);
        expect(b1 - b0).toBeLessThanOrEqual(w.short_body.strength / w.short_body.length_scale + 1e-6);
      })
    );
  });
});

describe('boost properties', () => {
  it('overlap boost saturates monotonically, bounded by scale, half at half_sat', () => {
    fc.assert(
      fc.property(arbBoostWeights, fc.nat({ max: 1000 }), (b, n) => {
        expect(overlapBoost(0, b)).toBe(0);
        const at = overlapBoost(n, b);
        expect(at).toBeGreaterThanOrEqual(0);
        expect(at).toBeLessThanOrEqual(f(b.word_overlap.scale));
        expect(overlapBoost(n + 1, b)).toBeGreaterThanOrEqual(at);
        expect(Math.abs(overlapBoost(b.word_overlap.half_sat, b) - b.word_overlap.scale / 2)).toBeLessThanOrEqual(1e-6);
      })
    );
  });

  it('effective boosts are reliability-ordered, strictly for a positive increment', () => {
    fc.assert(
      fc.property(arbBoostWeights, (b) => {
        // The category boost lands on a score as f32, like the derived two.
        const category = f(b.category);
        const eff = derivedBoosts(b);
        expect(eff.exactWord).toBeGreaterThanOrEqual(category);
        expect(eff.resolver).toBeGreaterThanOrEqual(eff.exactWord);
        if (b.exact_word_increment > 0) expect(eff.exactWord).toBeGreaterThan(category);
        if (b.resolver_increment > 0) expect(eff.resolver).toBeGreaterThan(eff.exactWord);
      })
    );
  });
});
