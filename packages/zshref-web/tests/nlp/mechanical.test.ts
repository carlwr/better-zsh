// The mechanical eval: the question templates, the built set's shape (pure
// on the corpus), the blend and the slices on synthetic input, the eval
// chain over the parity fixture's miniature index (no model), and — with
// the staged index and model — a capped smoke plus the full report.
//
// The full report embeds thousands of queries (minutes), so it is opt-in
// via `BZ_NLP_SLOW=1`, on top of the artifact gate —
// `BZ_REQUIRE_WEB_ARTIFACTS=1` alone does not run it, so the CI `nlp` job
// stays at the capped smoke; `pnpm nlp:eval-mechanical` is the report's
// day-to-day form.

import { loadCorpus } from '@carlwr/zsh-core';
import { docCategories, docDisplay } from '@carlwr/zsh-core/taxonomy';
import { describe, expect, it } from 'vitest';

import { buildLookupContract } from '../../nlp/contract';
import { loadEvalAssets } from '../../nlp/eval/assets';
import {
  buildMechanical,
  combinedTotal,
  evalMechanical,
  evalMechanicalCached,
  LAMBDA,
  nlQuestions,
  renderCombined,
  renderMechanical,
  SLICES,
  TARGET_DEPTH
} from '../../nlp/eval/mechanical';
import { gain } from '../../nlp/eval/metric';
import { evalSentence } from '../../nlp/eval/sentence';
import { loadSentenceFixture } from '../../nlp/eval/sentence-fixture';
import { buildParityIndex, syntheticVec } from '../../nlp/fixtures';
import { corpusResolverHit, noResolverHit } from '../../nlp/oracle';
import { loadRulesYaml } from '../../nlp/rules-load';
import { LookupIndex } from '../../src/lib/ranker/lookup-map';
import { artifactGate, STAGED } from '../_helpers';

const corpus = loadCorpus();

/** Cap for the smoke: enough entries to exercise embed → rank → score → tally without the full run. */
const MECHANICAL_SMOKE_LIMIT = 16;

describe('nl questions', () => {
  it('nl_question_templates_seven_categories', () => {
    for (const [cat, display] of [
      ['builtin', 'fc'],
      ['special_param', 'PATH'],
      ['option', 'AUTO_CD'],
      ['reserved_word', 'if'],
      ['mathfunc', 'abs'],
      ['comp_utility', '_arguments'],
      ['zle_widget', 'accept-line']
    ] as const) {
      expect(nlQuestions(cat, display), `${cat} templated`).not.toEqual([]);
    }
    // special_param yields the plain + a `$`-prefixed variant.
    const sp = nlQuestions('special_param', '#');
    expect(sp).toHaveLength(2);
    expect(sp.some((q) => q.includes('$#')), `$-prefixed form: ${sp}`).toBe(true);
    // Intentionally NOT templated (not a hard-check category).
    expect(nlQuestions('redirection', '>')).toEqual([]);
  });
});

// Pure on the corpus, but two contract builds each: seconds on a loaded CI worker.
describe('build', () => {
  /** Non-trivial, every entry well-formed, in build order: the contract's decorated phrasings, then the questions. */
  it('mechanical_build_is_well_formed', () => {
    const entries = buildMechanical(corpus);
    const decorated = buildLookupContract(corpus).entries.filter((e) => e.phrasingKind !== 'bare');
    expect(decorated.length).toBeGreaterThan(0);
    const questions = docCategories.flatMap((cat) =>
      [...corpus[cat].values()].flatMap((rec) => nlQuestions(cat, docDisplay(cat, rec)))
    );
    expect(questions.length).toBeGreaterThan(0);
    expect(entries).toHaveLength(decorated.length + questions.length);
    expect(entries.slice(0, decorated.length).map((e) => e.query)).toEqual(decorated.map((e) => e.query));
    expect(entries.slice(decorated.length).map((e) => e.query)).toEqual(questions);

    const known = new Map(docCategories.map((cat) => [cat as string, new Set<string>(corpus[cat].keys())]));
    for (const e of entries) {
      expect(e.query.trim()).not.toBe('');
      expect(e.split).toBe('train');
      expect(e.want).toHaveLength(1);
      const [item] = e.want;
      expect(item).toMatchObject({ targetDepth: TARGET_DEPTH, weight: 1 });
      expect(known.get(item?.category ?? '')?.has(item?.id ?? '')).toBe(true);
    }
  });

  /** A phrasing several records share (`! reserved word` resolves five ways) wants the record it came from. */
  it('a decorated entry wants its own record, not the contract set', () => {
    const entries = buildMechanical(corpus);
    const shared = buildLookupContract(corpus).entries.find(
      (e) => e.phrasingKind !== 'bare' && e.expectedSet.length > 1
    );
    if (!shared) throw new Error('no decorated contract entry with a multi-member set');
    const own = entries.find((e) => e.query === shared.query);
    expect(own?.want).toEqual([{ ...shared.record, targetDepth: TARGET_DEPTH, weight: 1 }]);
  });
}, 30_000);

describe('combined total', () => {
  it('blends curated train and mechanical by λ', () => {
    expect(LAMBDA).toBe(0.5);
    expect(combinedTotal(1, 0)).toBeCloseTo(LAMBDA, 6);
    expect(combinedTotal(0, 1)).toBeCloseTo(1 - LAMBDA, 6);
    expect(combinedTotal(0.8, 0.6)).toBeCloseTo(0.7, 6);
    expect(combinedTotal(0.5, 0.5)).toBe(0.5);
    expect(renderCombined(0.8, 0.6)).toBe('[combined] curated_train=0.800  mechanical=0.600  λ=0.5  total=0.700\n');
  });
});

describe('slices', () => {
  const classify = (id: string): string[] => SLICES.filter((s) => s.pred(id)).map((s) => s.label);

  it('bucket by code-point length and punctuation, overlapping', () => {
    expect(SLICES.map((s) => s.label)).toEqual([
      'id length 1',
      'id length 2',
      'id length 3',
      'id length 4',
      'punctuation-only'
    ]);
    expect(classify('#')).toEqual(['id length 1', 'punctuation-only']);
    expect(classify('fc')).toEqual(['id length 2']);
    expect(classify('>>_word')).toEqual([]);
    expect(classify('${')).toEqual(['id length 2', 'punctuation-only']);
    expect(classify('_arguments')).toEqual([]);
    expect(classify('')).toEqual([]);
    // Code points, not UTF-16 units; letters of any script are alphanumeric.
    expect(classify('é😀')).toEqual(['id length 2']);
  });
});

describe('eval over the parity index', () => {
  it('tallies violations and slices per graded item', async () => {
    const rules = await loadRulesYaml();
    const index = buildParityIndex(corpus, rules.synonyms.index_groups);
    // No lookup map: the ranker alone decides the order.
    const assets = { index, rules, lookup: new LookupIndex({ version: 1, entries: [] }) };
    const query = 'alpha';
    const vecs = new Map([[query, syntheticVec(['query', query])]]);
    const entries = index.records.map((r) => ({
      query,
      want: [{ category: r.text.category, id: r.text.id, targetDepth: TARGET_DEPTH, weight: 1 }],
      split: 'train' as const
    }));
    const r = evalMechanicalCached(entries, vecs, assets, noResolverHit);
    expect(r.nEntries).toBe(entries.length);
    // One record ranks #1; every other entry is a violation of its category.
    const violations = [...r.violations.values()].reduce((a, b) => a + b, 0);
    expect(violations).toBe(entries.length - 1);
    for (const [cat, n] of r.perCategoryN) expect(r.violations.get(cat) ?? 0).toBeLessThanOrEqual(n);
    expect(r.train.total).toBe(r.all.total);
    expect(r.holdout.total).toBe(0);
    // The parity records: `.` and `f` are 1-char ids, `.` punctuation-only.
    const slice = (label: string) => r.slices.find((s) => s.label === label);
    expect(slice('id length 1')).toMatchObject({ n: 2 });
    expect(slice('punctuation-only')).toMatchObject({ n: 1 });
    for (const s of r.slices) {
      expect(s.fails).toBeLessThanOrEqual(s.n);
      if (s.n === 0) expect(s.meanGain).toBe(0);
      else expect(s.meanGain).toBeGreaterThan(0);
    }
    // Every item is in the index, so no category scores below the gain at the last rank.
    const rendered = renderMechanical(r);
    expect(rendered.startsWith(`[mechanical] total=${r.all.total.toFixed(3)}  (${entries.length} entries)\n`)).toBe(true);
    for (const [cat, s] of r.all.perCategory) {
      expect(s).toBeGreaterThanOrEqual(gain(entries.length, TARGET_DEPTH));
      expect(s).toBeLessThanOrEqual(1);
      expect(rendered).toContain(
        `  ${cat.padEnd(20)} ${s.toFixed(3)}  (n=${r.perCategoryN.get(cat)}, #1-violations=${r.violations.get(cat) ?? 0})\n`
      );
    }
  });
});

describe('mechanical eval over the staged assets', () => {
  const skipReason = artifactGate('mechanical eval', [STAGED.index, STAGED.model]);

  it('mechanical_smoke', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    const assets = await loadEvalAssets();
    const entries = buildMechanical(assets.corpus).slice(0, MECHANICAL_SMOKE_LIMIT);
    const r = await evalMechanical(entries, assets, corpusResolverHit(assets.corpus));
    expect(r.nEntries).toBe(entries.length);
    expect(r.all.total).toBeGreaterThanOrEqual(0);
    expect(r.all.total).toBeLessThanOrEqual(1);
    expect([...r.perCategoryN.values()].reduce((a, b) => a + b, 0)).toBe(entries.length);
  }, 180_000);

  it('mechanical_sentences_report', async (ctx) => {
    if (process.env.BZ_NLP_SLOW !== '1') ctx.skip('slow (embeds thousands of queries) — opt in with BZ_NLP_SLOW=1');
    if (skipReason) ctx.skip(skipReason);
    const assets = await loadEvalAssets();
    const resolverHit = corpusResolverHit(assets.corpus);
    const mech = await evalMechanical(buildMechanical(assets.corpus), assets, resolverHit);
    const curated = await evalSentence(await loadSentenceFixture(), assets, resolverHit);
    console.log((renderMechanical(mech) + renderCombined(curated.train.total, mech.all.total)).trimEnd());
    expect(mech.all.total).toBeGreaterThanOrEqual(0);
    expect(mech.all.total).toBeLessThanOrEqual(1);
  }, 1_800_000);
});
