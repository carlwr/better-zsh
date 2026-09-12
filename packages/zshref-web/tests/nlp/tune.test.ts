// The tuning trio (nlp/eval/{tune,sweep,diff}.ts): the ablation helpers,
// the `BZ_TUNE_BASE` override syntax knob by knob, churn and the diff
// report on hand-made items, the sweep marks and row layout on synthetic
// rows, the box table's characters and alignment, and the reports'
// structure over the parity fixture's miniature index (no model). The
// reporters over the staged assets are smoked in reporters.test.ts. No
// assertion holds a number from a real eval.

import { loadCorpus } from '@carlwr/zsh-core';
import { describe, expect, it } from 'vitest';

import { churn, type ItemRes, perItem, renderDiffReport } from '../../nlp/eval/diff';
import { rustDebugString, rustFixed, signed } from '../../nlp/eval/format';
import { evalMechanicalCached, LAMBDA } from '../../nlp/eval/mechanical';
import { evalSentenceCached, gradeEntries } from '../../nlp/eval/sentence';
import type { SentenceEntry } from '../../nlp/eval/sentence-fixture';
import {
  applyOverride,
  type Bench,
  composedBase,
  KNOB_KEYS,
  KNOBS,
  type KnobKey,
  knobLabel,
  renderKnobBlock,
  renderSweep,
  renderTuneDiff,
  runSweep,
  type Scores,
  sweepKnob,
  sweepMarks,
  withKnob
} from '../../nlp/eval/sweep';
import {
  boxTable,
  type Dashboard,
  renderDashboard,
  withTuning,
  zeroBoosts,
  zeroedCache
} from '../../nlp/eval/tune';
import { buildParityIndex, SANITY_QUERIES, SANITY_VERSION, type SanityFixture, syntheticVec } from '../../nlp/fixtures';
import { noResolverHit } from '../../nlp/oracle';
import { loadRulesYaml } from '../../nlp/rules-load';
import { LookupIndex } from '../../src/lib/ranker/lookup-map';
import { derivedBoosts, type Tuning } from '../../src/lib/ranker/types';

const corpus = loadCorpus();
const rules = await loadRulesYaml();
const committed = rules.tuning;

/** The same field each knob sets, read back — the assertion side of the KNOBS table. */
const knobValue: Record<KnobKey, (t: Tuning) => number> = {
  body: (t) => t.semantic_weights.body,
  structured: (t) => t.semantic_weights.structured,
  sb_strength: (t) => t.semantic_weights.short_body.strength,
  sb_length: (t) => t.semantic_weights.short_body.length_scale,
  cat: (t) => t.boosts.category,
  exact_inc: (t) => t.boosts.exact_word_increment,
  resolver_inc: (t) => t.boosts.resolver_increment,
  wo_scale: (t) => t.boosts.word_overlap.scale,
  wo_halfsat: (t) => t.boosts.word_overlap.half_sat,
  rarity: (t) => t.penalties.category_rarity_max,
  disc_len: (t) => t.lexical.min_discriminating_word_len,
  sig_len: (t) => t.lexical.min_significant_word_len
};

const item = (over: Partial<ItemRes>): ItemRes => ({
  query: 'q',
  cat: 'option',
  id: 'x',
  split: 'train',
  rank: 1,
  gain: 1,
  depth: 3,
  ...over
});

describe('ablation helpers', () => {
  it('zeroed_cache_is_all_zero_same_keys', () => {
    const vecs = new Map([
      ['a', new Float32Array(384).fill(0.3)],
      ['b', new Float32Array(384).fill(-0.1)]
    ]);
    const z = zeroedCache(vecs);
    expect([...z.keys()]).toEqual(['a', 'b']);
    for (const v of z.values()) {
      expect(v).toHaveLength(384);
      expect(v.every((x) => x === 0)).toBe(true);
    }
  });

  it('zero_boosts_zeros_every_boost_term', () => {
    const t = zeroBoosts(committed);
    expect(t.boosts.category).toBe(0);
    expect(derivedBoosts(t.boosts)).toEqual({ exactWord: 0, resolver: 0 });
    expect(t.boosts.word_overlap.scale).toBe(0);
    expect(t.penalties.category_rarity_max).toBe(0);
    // Untouched: the semantic mix, the overlap's saturation, the lexical thresholds; and the input.
    expect(t.semantic_weights).toEqual(committed.semantic_weights);
    expect(t.boosts.word_overlap.half_sat).toBe(committed.boosts.word_overlap.half_sat);
    expect(t.lexical).toEqual(committed.lexical);
    expect(committed.boosts.category).not.toBe(0);
  });

  it('withTuning swaps the tuning and nothing else', () => {
    const assets = { index: buildParityIndex(corpus, rules.synonyms.index_groups), rules, lookup: new LookupIndex({ version: 1, entries: [] }) };
    const t = zeroBoosts(committed);
    const a = withTuning(assets, t);
    expect(a.rules.tuning).toBe(t);
    expect(a.rules.stopwords).toBe(rules.stopwords);
    expect(a.index).toBe(assets.index);
    expect(assets.rules.tuning).toBe(committed);
  });
});

describe('overrides', () => {
  it('applyOverride sets each knob, f32 or usize, on a copy', () => {
    const before = structuredClone(committed);
    for (const key of KNOB_KEYS) {
      const { kind } = KNOBS[key];
      const raw = kind === 'f32' ? '0.125' : '5';
      const t = applyOverride(committed, key, raw);
      expect(knobValue[key](t), key).toBe(Number(raw));
      // Every other knob keeps its value.
      for (const other of KNOB_KEYS) {
        if (other !== key) expect(knobValue[other](t), `${key} left ${other}`).toBe(knobValue[other](committed));
      }
    }
    expect(committed).toEqual(before);
  });

  it('f32 knobs take the f32 of the literal; usize knobs take integers only', () => {
    expect(knobValue.cat(applyOverride(committed, 'cat', '0.1'))).toBe(Math.fround(0.1));
    expect(knobValue.cat(applyOverride(committed, 'cat', '1e-2'))).toBe(Math.fround(0.01));
    expect(knobValue.cat(applyOverride(committed, 'cat', '-.5'))).toBe(-0.5);
    expect(knobValue.disc_len(applyOverride(committed, 'disc_len', '+4'))).toBe(4);
    expect(() => applyOverride(committed, 'disc_len', '2.5')).toThrow(/usize/);
    expect(() => applyOverride(committed, 'cat', 'abc')).toThrow(/f32/);
    expect(() => applyOverride(committed, 'cat', '')).toThrow(/f32/);
  });

  it('applyOverride throws on an unknown key', () => {
    expect(() => applyOverride(committed, 'bogus', '1')).toThrow(/unknown BZ_TUNE_BASE key: "bogus"/);
    expect(() => applyOverride(committed, 'toString', '1')).toThrow(/unknown/);
  });

  it('overrides bypass the load-time range checks', () => {
    // MAX_SCORE_TERM would refuse this at load; a sweep point may exceed it.
    expect(knobValue.cat(applyOverride(committed, 'cat', '0.9'))).toBe(Math.fround(0.9));
  });

  it('composedBase parses key=value pairs, trims, skips empties', () => {
    expect(composedBase(committed, undefined)).toEqual(committed);
    expect(composedBase(committed, '')).toEqual(committed);
    expect(composedBase(committed, ' , ')).toEqual(committed);
    const t = composedBase(committed, ' cat = 0.02 , disc_len=4,,sig_len=1');
    expect(knobValue.cat(t)).toBe(Math.fround(0.02));
    expect(knobValue.disc_len(t)).toBe(4);
    expect(knobValue.sig_len(t)).toBe(1);
    expect(knobValue.body(t)).toBe(knobValue.body(committed));
    // Later pairs win.
    expect(knobValue.cat(composedBase(committed, 'cat=0.02,cat=0.04'))).toBe(Math.fround(0.04));
    expect(() => composedBase(committed, 'cat')).toThrow(/key=value/);
    expect(() => composedBase(committed, 'cat=0.02,nope=1')).toThrow(/unknown/);
  });

  it('knob points are labelled {:.3} for f32 and as integers for usize', () => {
    expect(knobLabel('f32', 0.55)).toBe('0.550');
    expect(knobLabel('f32', 16)).toBe('16.000');
    expect(knobLabel('usize', 3)).toBe('3');
    for (const key of KNOB_KEYS) {
      const { kind, points } = KNOBS[key];
      expect(points.length, key).toBeGreaterThan(1);
      if (kind === 'usize') for (const p of points) expect(Number.isInteger(p), key).toBe(true);
      for (const p of points) expect(knobValue[key](withKnob(committed, key, p)), key).toBe(Math.fround(p));
    }
  });
});

describe('churn', () => {
  it('counts moved, up, down grossly and nets the gain', () => {
    const base = [
      item({ rank: 5, gain: 0.3 }), // fail → pass
      item({ rank: 1, gain: 1 }), // pass → fail
      item({ rank: 2, gain: 0.8 }), // moved, still a pass
      item({ rank: 9, gain: 0.1 }), // unmoved
      item({ rank: 4, gain: 0.4, split: 'holdout' }) // holdout: fail → pass
    ];
    const cand = [
      item({ rank: 2, gain: 0.8 }),
      item({ rank: 7, gain: 0.2 }),
      item({ rank: 3, gain: 0.6 }),
      item({ rank: 9, gain: 0.1 }),
      item({ rank: 1, gain: 1, split: 'holdout' })
    ];
    const all = churn(base, cand, false);
    expect(all).toMatchObject({ moved: 4, up: 2, down: 1 });
    expect(all.netGain).toBeCloseTo(0.5 - 0.8 - 0.2 + 0.6, 5);
    const train = churn(base, cand, true);
    expect(train).toMatchObject({ moved: 3, up: 1, down: 1 });
    expect(train.netGain).toBeCloseTo(0.5 - 0.8 - 0.2, 5);
    expect(churn([], [], true)).toEqual({ moved: 0, up: 0, down: 0, netGain: 0 });
    expect(() => churn(base, cand.slice(1), false)).toThrow(/aligned/);
  });

  it('a pass is rank at or above the depth', () => {
    const b = [item({ rank: 3, depth: 3, gain: 0.9 })];
    expect(churn(b, [item({ rank: 4, depth: 3, gain: 0.7 })], false)).toMatchObject({ down: 1, up: 0 });
    expect(churn(b, [item({ rank: 1, depth: 3, gain: 1 })], false)).toMatchObject({ down: 0, up: 0, moved: 1 });
  });
});

describe('report formatting', () => {
  // The expectations are Rust's `{:.N}` / `{:?}` output for the same values
  // (the rule the reports keep; nlp/eval/format.ts).
  it('rustFixed rounds exact ties to even, as {:.N} does', () => {
    const f = Math.fround;
    expect(rustFixed(f(0.5625), 3)).toBe('0.562');
    expect(rustFixed(f(0.8125), 3)).toBe('0.812');
    expect(rustFixed(f(0.6875), 3)).toBe('0.688');
    expect(rustFixed(f(0.0625), 3)).toBe('0.062');
    expect(rustFixed(f(0.9375), 3)).toBe('0.938');
    expect(rustFixed(f(0.03125), 4)).toBe('0.0312');
    expect(rustFixed(f(0.09375), 4)).toBe('0.0938');
    expect(rustFixed(0.25, 1)).toBe('0.2');
    expect(rustFixed(2.5, 0)).toBe('2');
    expect(rustFixed(3.5, 0)).toBe('4');
    // A carry on the round-up.
    expect(rustFixed(0.9995, 3)).toBe('1.000');
    expect(rustFixed(0.99951171875, 3)).toBe('1.000');
    // Not ties: nearest, as the binary value falls (0.45f32 is below 0.45).
    expect(rustFixed(f(0.45), 1)).toBe('0.4');
    expect(rustFixed(0.45, 1)).toBe('0.5');
    expect(rustFixed(f(0.1), 3)).toBe('0.100');
    expect(rustFixed(12.3, 1)).toBe('12.3');
    expect(rustFixed(f(62.3), 1)).toBe('62.3');
    expect(rustFixed(-0.5625, 3)).toBe('-0.562');
    expect(rustFixed(-1e-9, 3)).toBe('-0.000');
    expect(rustFixed(-0, 3)).toBe('-0.000');
    expect(rustFixed(0, 3)).toBe('0.000');
    expect(rustFixed(7, 3)).toBe('7.000');
  });

  it('signed prints the sign always', () => {
    expect(signed(0.5, 3)).toBe('+0.500');
    expect(signed(-0.5, 3)).toBe('-0.500');
    expect(signed(0, 3)).toBe('+0.000');
    expect(signed(-0.00001, 4)).toBe('-0.0000');
    expect(signed(-0, 3)).toBe('-0.000');
    expect(signed(0.5625, 3)).toBe('+0.562');
  });

  it('rustDebugString escapes as {:?} does', () => {
    expect(rustDebugString('plain')).toBe('"plain"');
    expect(rustDebugString('say "hi"')).toBe('"say \\"hi\\""');
    expect(rustDebugString('a\\b')).toBe('"a\\\\b"');
    expect(rustDebugString("it's")).toBe('"it\'s"');
    expect(rustDebugString('x\ny\tz\r\0')).toBe('"x\\ny\\tz\\r\\0"');
    expect(rustDebugString('\x01\x7f')).toBe('"\\u{1}\\u{7f}"');
    expect(rustDebugString('é ⬆ $?')).toBe('"é ⬆ $?"');
  });
});

describe('diff report', () => {
  it('lists movers by |Δgain| (stable), marks crossings, filters to train', () => {
    const base = [
      item({ query: 'one', id: 'a', rank: 5, gain: 0.3 }),
      item({ query: 'two', id: 'b', rank: 1, gain: 1 }),
      item({ query: 'same', id: 'c', rank: 2, gain: 0.8 }),
      item({ query: 'tie1', id: 'd', rank: 2, gain: 0.8 }),
      item({ query: 'tie2', id: 'e', rank: 2, gain: 0.8 }),
      item({ query: 'hidden', id: 'h', rank: 9, gain: 0.1, split: 'holdout' })
    ];
    const cand = [
      item({ query: 'one', id: 'a', rank: 2, gain: 0.8 }),
      item({ query: 'two', id: 'b', rank: 12, gain: 0.05 }),
      item({ query: 'same', id: 'c', rank: 2, gain: 0.8 }),
      item({ query: 'tie1', id: 'd', rank: 3, gain: 0.7 }),
      item({ query: 'tie2', id: 'e', rank: 4, gain: 0.9 }),
      item({ query: 'hidden', id: 'h', rank: 1, gain: 1, split: 'holdout' })
    ];
    const r = renderDiffReport('curated train', base, cand, true);
    expect(r.split('\n')).toEqual([
      '',
      '[curated train] 5 items, 4 moved rank; depth-crossings: 1 fail→pass, 2 pass→fail; Σgain Δ=-0.450 (flat per-item, not category-normalized)',
      '  -0.950  rank   1→12   option/b  q="two" ⬇FAIL',
      '  +0.500  rank   5→2    option/a  q="one" ⬆PASS',
      '  -0.100  rank   2→3    option/d  q="tie1"',
      '  +0.100  rank   2→4    option/e  q="tie2" ⬇FAIL',
      ''
    ]);
    // Without the filter the holdout item counts and prints.
    const all = renderDiffReport('x', base, cand, false);
    expect(all).toContain('[x] 6 items, 5 moved rank; depth-crossings: 2 fail→pass, 2 pass→fail;');
    expect(all).toContain('q="hidden" ⬆PASS');
  });

  it('caps the movers at 40 and counts the rest', () => {
    const n = 45;
    const base = Array.from({ length: n }, (_, i) => item({ query: `q${i}`, rank: 1, gain: 1 }));
    const cand = Array.from({ length: n }, (_, i) => item({ query: `q${i}`, rank: 2 + i, gain: 0.5 }));
    const lines = renderDiffReport('m', base, cand, false).trimEnd().split('\n');
    expect(lines).toHaveLength(1 + 1 + 40 + 1);
    expect(lines.at(-1)).toBe('  … 5 more movers');
    expect(lines.filter((l) => l.includes('  q=')).length).toBe(40);
  });
});

describe('box table', () => {
  it('draws the frame, pads by character count, aligns per column', () => {
    const t = boxTable(
      ['category', 'mech', 'n'],
      [false, true, true],
      [
        ['builtin', '0.912', '12'],
        ['zle_widget', '—', '·'],
        ['x', '10.000', '1234']
      ]
    );
    expect(t).toBe(
      [
        '┌────────────┬────────┬──────┐',
        '│ category   │   mech │    n │',
        '├────────────┼────────┼──────┤',
        '│ builtin    │  0.912 │   12 │',
        '│ zle_widget │      — │    · │',
        '│ x          │ 10.000 │ 1234 │',
        '└────────────┴────────┴──────┘',
        ''
      ].join('\n')
    );
  });

  it('a header wider than every cell sets the width; no rows is a frame', () => {
    expect(boxTable(['id slice', 'score'], [false, true], [])).toBe(
      '┌──────────┬───────┐\n│ id slice │ score │\n├──────────┼───────┤\n└──────────┴───────┘\n'
    );
  });
});

describe('sweep marks and rows', () => {
  it('◄ best goes to the last maximum; (base) to a zero delta', () => {
    expect(sweepMarks([0.5, 0.7, 0.7, 0.6], 0.6)).toEqual(['', '', ' ◄ best', ' (base)']);
    // A base-valued row that is not the (last) best is marked as the base.
    expect(sweepMarks([0.5, 0.7, 0.7, 0.6], 0.7)).toEqual(['', ' (base)', ' ◄ best', '']);
    expect(sweepMarks([0.6, 0.6], 0.6)).toEqual([' (base)', ' ◄ best']);
    // The epsilon: a rounding-size delta is still the base; a printed-digit one is not.
    expect(sweepMarks([0.6 + 1e-8, 0.61], 0.6)).toEqual([' (base)', ' ◄ best']);
    expect(sweepMarks([0.6 + 1e-4, 0.61], 0.6)).toEqual(['', ' ◄ best']);
    expect(sweepMarks([], 0.6)).toEqual([]);
  });

  it('renderKnobBlock lays out the header and one row per point', () => {
    const scores = (combined: number): Scores => ({ train: 0.5, holdout: 0.25, mechanical: 0.75, combined });
    const block = renderKnobBlock(
      {
        knob: 'disc_len',
        rows: [
          { label: '2', scores: scores(0.61) },
          { label: '3', scores: scores(0.6) },
          { label: '4', scores: scores(0.59) }
        ]
      },
      0.6
    );
    expect(block).toBe(
      [
        '',
        '── disc_len ───────────────────  (base combined=0.6000)',
        '  2          comb=0.6100 Δ=+0.0100  train=0.5000 hold=0.2500 mech=0.7500 ◄ best',
        '  3          comb=0.6000 Δ=+0.0000  train=0.5000 hold=0.2500 mech=0.7500 (base)',
        '  4          comb=0.5900 Δ=-0.0100  train=0.5000 hold=0.2500 mech=0.7500',
        ''
      ].join('\n')
    );
  });
});

// --- over the parity fixture's miniature index (no model) ---------------------

const parityAssets = {
  index: buildParityIndex(corpus, rules.synonyms.index_groups),
  rules,
  lookup: new LookupIndex({ version: 1, entries: [] })
};
const record = (i: number) => {
  const r = parityAssets.index.records[i];
  if (!r) throw new Error('parity index has 9 records');
  return { category: r.text.category, id: r.text.id };
};
const want = (i: number, targetDepth = 3, weight = 1) => ({ ...record(i), targetDepth, weight });
const parityEntries: SentenceEntry[] = [
  { query: 'alpha', want: [want(0), want(3, 1)], split: 'train' },
  { query: 'beta', want: [want(5)], split: 'holdout' },
  { query: 'gamma', want: [want(7, 2, 2), want(8)], split: 'train' }
];
const parityVecs = new Map(parityEntries.map((e) => [e.query, syntheticVec(['query', e.query])]));
const parityFixture = { defaultWeight: 1, defaultTargetDepth: 3, entries: parityEntries };

/** A bench over the mini index: the caches pre-filled, the embedder never reached. */
const parityBench = (): Bench => ({
  assets: {
    ...parityAssets,
    corpus,
    embedder: {
      embed: () => Promise.reject(new Error('the bench embeds nothing: its caches are pre-filled'))
    }
  },
  fixture: parityFixture,
  curatedVecs: parityVecs,
  mechEntries: parityAssets.index.records.map((r, i) => ({
    query: `alpha ${r.text.id}`,
    want: [want(i, 1)],
    split: 'train' as const
  })),
  mechVecs: new Map(parityAssets.index.records.map((r) => [`alpha ${r.text.id}`, syntheticVec(['query', 'alpha'])])),
  resolverHit: noResolverHit
});

describe('per item over the parity index', () => {
  it('is index-aligned with the entries flattened over their want sets', () => {
    const items = perItem(parityEntries, parityVecs, parityAssets, noResolverHit);
    const graded = gradeEntries(parityEntries, parityVecs, parityAssets, noResolverHit);
    expect(items).toHaveLength(5);
    expect(items.map((r) => [r.query, r.cat, r.id, r.split, r.depth])).toEqual(
      parityEntries.flatMap((e) => e.want.map((w) => [e.query, w.category, w.id, e.split, w.targetDepth]))
    );
    expect(items.map((r) => [r.rank, r.gain])).toEqual(graded.map((g) => [g.rank, g.gain]));
    for (const r of items) {
      expect(r.rank).toBeGreaterThanOrEqual(1);
      expect(r.rank).toBeLessThanOrEqual(parityAssets.index.records.length);
    }
    // The same tuning twice: no churn at all.
    expect(churn(items, perItem(parityEntries, parityVecs, parityAssets, noResolverHit), false)).toEqual({
      moved: 0,
      up: 0,
      down: 0,
      netGain: 0
    });
  });
});

describe('sweep over the parity index', () => {
  it('runSweep scores every knob point; renderSweep has the report shape', () => {
    const bench = parityBench();
    const sweep = runSweep(bench, committed);
    expect(sweep.knobs.map((k) => k.knob)).toEqual(KNOB_KEYS);
    for (const k of sweep.knobs) {
      expect(k.rows.map((r) => r.label)).toEqual(KNOBS[k.knob].points.map((p) => knobLabel(KNOBS[k.knob].kind, p)));
      for (const { scores } of k.rows) {
        expect(scores.combined).toBe(Math.fround(Math.fround(LAMBDA * scores.train) + Math.fround((1 - LAMBDA) * scores.mechanical)));
        for (const v of Object.values(scores)) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
    const text = renderSweep(sweep, 'cat=0.02');
    const lines = text.split('\n');
    expect(lines[0]).toBe('');
    expect(lines[1]).toBe('=== tuning sweep (one knob at a time) ===');
    expect(lines[2]).toMatch(/^base: combined=\d\.\d{4} {2}train=\d\.\d{4} {2}holdout=\d\.\d{4} {2}mechanical=\d\.\d{4} {2}\(BZ_TUNE_BASE="cat=0\.02"\)$/);
    expect(lines.filter((l) => l.startsWith('── ')).map((l) => l.split(' ')[1])).toEqual(KNOB_KEYS);
    const rows = lines.filter((l) => l.startsWith('  '));
    expect(rows).toHaveLength(KNOB_KEYS.reduce((n, k) => n + KNOBS[k].points.length, 0));
    for (const row of rows) {
      expect(row).toMatch(/^ {2}\S+ +comb=\d\.\d{4} Δ=[+-]\d\.\d{4} {2}train=\d\.\d{4} hold=\d\.\d{4} mech=\d\.\d{4}( ◄ best| \(base\))?$/);
    }
    // Exactly one best per knob, and the base row present where the base value is a point.
    expect(lines.filter((l) => l.endsWith(' ◄ best'))).toHaveLength(KNOB_KEYS.length);
    expect(lines.filter((l) => l.endsWith(' (base)')).length).toBeGreaterThan(0);
    expect(text.endsWith('\n=== end sweep ===\n')).toBe(true);
    // A single knob renders as its block of the whole.
    expect(text).toContain(renderKnobBlock(sweepKnob(bench, committed, 'cat'), sweep.base.combined));
  });

  it('renderTuneDiff reports both sets, curated train-only', () => {
    const bench = parityBench();
    const text = renderTuneDiff(bench, committed, zeroBoosts(committed), 'cat=0');
    const lines = text.split('\n');
    expect(lines.slice(0, 3)).toEqual(['', '=== tune diff: base vs candidate ===', 'candidate BZ_TUNE_BASE="cat=0"']);
    const heads = lines.filter((l) => l.startsWith('['));
    expect(heads).toHaveLength(2);
    expect(heads[0]).toMatch(/^\[curated train\] 4 items, \d+ moved rank; depth-crossings: \d+ fail→pass, \d+ pass→fail; Σgain Δ=[+-]\d\.\d{3} \(flat per-item, not category-normalized\)$/);
    expect(heads[1]).toMatch(/^\[mechanical\] 9 items, /);
    expect(text).not.toContain('q="beta"');
    for (const l of lines.filter((l) => l.startsWith('  ') && !l.startsWith('  …'))) {
      expect(l).toMatch(/^ {2}[+-]\d\.\d{3} {2}rank +\d+→\d+ +\S+\/\S+ {2}q="[^"]*"( ⬆PASS| ⬇FAIL)?$/);
    }
    // The same tuning on both sides: no movers.
    expect(renderTuneDiff(bench, committed, committed, '').split('\n').filter((l) => l.includes('  q='))).toEqual([]);
  });
});

describe('dashboard render over the parity index', () => {
  const sanity: SanityFixture = {
    version: SANITY_VERSION,
    invariants: { absoluteFloor: Math.fround(0.7), minMargin: Math.fround(0.03) },
    entries: SANITY_QUERIES.map((q) => ({
      query: q.query,
      topMatch: { category: q.category, id: q.id, score: 0.9 },
      runnerUp: { category: 'option', id: 'other', score: 0.5 }
    }))
  };
  const sentence = evalSentenceCached(parityFixture, parityVecs, parityAssets, noResolverHit);
  const bench = parityBench();
  const mechanical = evalMechanicalCached(bench.mechEntries, bench.mechVecs, parityAssets, noResolverHit);
  const dashboard: Dashboard = {
    sentence,
    curatedTrain: sentence.train.total,
    sanity,
    bare: { bareTotal: 3, failures: [], skippedDecorated: 2 },
    mechanical,
    qa: { avgPercent: 12.3, hardPercent: 45.6 },
    components: { train: [0.5, 0.25, 0.125], holdout: [1, 0, 0.125], mech: [0.75, 0.5, 0.25] },
    churn: { curated: { moved: 12, up: 3, down: 4, netGain: -0.0123 }, mechanical: { moved: 1234, up: 10, down: 100, netGain: 0.5 } }
  };

  it('renders every block in order', () => {
    const lines = renderDashboard(dashboard).split('\n');
    expect(lines[0]).toBe('');
    expect(lines[1]).toBe('=== nlp tuning dashboard ===');
    expect(lines[2]).toBe(
      `[sentence]  all=${sentence.all.total.toFixed(3)}  train=${sentence.train.total.toFixed(3)}  holdout=${sentence.holdout.total.toFixed(3)}  (3 entries)`
    );
    expect(lines[3]).toBe('[sanity] 5/5 hold  floor≥0.7 (worst 0.900)  margin≥0.03 (worst 0.400)');
    expect(lines[4]).toBe('[contract] 3 bare entries, 0 failures');
    expect(lines[5]).toBe(`[mechanical] ${mechanical.all.total.toFixed(3)}  (9 entries)`);
    expect(lines[6]).toMatch(/^\[combined\] {2}λ·train \+ \(1−λ\)·mech = 0\.500·\d\.\d{3} \+ 0\.500·\d\.\d{3} = \d\.\d{3}$/);
    expect(lines[7]).toBe('  holdout = overfit watch; never tune on it.');
    expect(lines.slice(8, 12)).toEqual([
      '',
      'churn vs committed baseline (gross counts — a small score Δ hides large churn):',
      '  curated train  12 moved │   3 fail→pass   4 pass→fail │ Σgain Δ -0.012 (net)',
      '  mechanical   1234 moved │  10 fail→pass 100 pass→fail │ Σgain Δ +0.500 (net)'
    ]);
    expect(lines.slice(12, 19)).toEqual([
      '',
      'component decomposition (lookup-map ON in all rows):',
      '  −embed = embedder off (boosts only); −boost = boosts off (embedder only)',
      '                 full  −embed  −boost',
      '  cur.train     0.500   0.250   0.125',
      '  cur.hold      1.000   0.000   0.125',
      '  mechanical    0.750   0.500   0.250'
    ]);
    expect(lines.slice(19, 22)).toEqual([
      '',
      'per category — curated split vs mechanical:',
      '  mech=mechanical  fix=cur.train  hold=cur.holdout  all=cur.both'
    ]);
    expect(lines[22]).toMatch(/^┌[─┬]+┐$/);
    expect(lines[23]).toBe('│ category       │  mech │   fix │  hold │   all │ n:mec │ n:cur │');
    // The union of categories: the mini index has 4, the curated entries reach 3 of them.
    const catRows = lines.slice(25, 29);
    expect(catRows.map((l) => l.split('│')[1]?.trim())).toEqual(['builtin', 'glob_qualifier', 'option', 'redirection']);
    for (const row of catRows) expect(row).toMatch(/^│ \S+ +│ +(\d\.\d{3}|—) │ +(\d\.\d{3}|—) │ +(\d\.\d{3}|—) │ +(\d\.\d{3}|—) │ +(\d+|—) │ +(\d+|—) │$/);
    // `beta` is the only holdout entry (redirection); builtin is curated at depth 1 only.
    expect(catRows[3]).toMatch(/^│ redirection +│ \d\.\d{3} │ +— │ \d\.\d{3} │/);
    expect(lines[29]).toMatch(/^└[─┴]+┘$/);
    expect(lines.slice(30, 33)).toEqual([
      '',
      'hard slices (mechanical; fail = expected record not #1):',
      '  cross-cutting & overlapping (a 1-char punct id is in both)'
    ]);
    expect(lines[34]).toBe('│ id slice         │ score │ fail/total │');
    expect(lines.slice(36, 41).map((l) => l.split('│')[1]?.trim())).toEqual([
      'id length 1',
      'id length 2',
      'id length 3',
      'id length 4',
      'punctuation-only'
    ]);
    expect(lines[42]).toBe('[qa] avg 12.3%, hard-check score 45.6% (held-out — never tune on this)');
    expect(lines.slice(43)).toEqual(['']);
  });

  it('renders the fast tier and the no-candidate line', () => {
    const fast: Dashboard = {
      ...dashboard,
      mechanical: null,
      qa: null,
      components: { ...dashboard.components, mech: null },
      churn: null
    };
    const text = renderDashboard(fast);
    expect(text).toContain('\n[mechanical] skipped (--fast; run `pnpm nlp:tune-dashboard` without it)\n  holdout = overfit watch');
    expect(text).toContain('\nchurn vs committed baseline: no candidate (set BZ_TUNE_BASE=<overrides> to diff)\n');
    expect(text).toContain('\n  cur.hold      1.000   0.000   0.125\n  mechanical  skipped (--fast)\n');
    expect(text).toContain('│ glob_qualifier │    · │');
    expect(text).toMatch(/│ +· │ +\d+ │\n/);
    expect(text).toContain('\nhard slices: skipped (--fast)\n[qa] skipped (--fast; run `pnpm nlp:tune-dashboard` without it)\n');
    expect(text).not.toContain('[combined]');
    // A candidate in the fast tier: the mechanical churn row is the skip note.
    const fastCandidate = renderDashboard({ ...fast, churn: { curated: { moved: 1, up: 0, down: 0, netGain: 0 }, mechanical: null } });
    expect(fastCandidate).toContain('\n  curated train   1 moved │   0 fail→pass   0 pass→fail │ Σgain Δ +0.000 (net)\n  mechanical   skipped (--fast)\n');
  });
});
