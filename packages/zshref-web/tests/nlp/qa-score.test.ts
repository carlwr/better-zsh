// The QA scoring: the entry arithmetic on synthetic inputs (each case pins
// one rule of the harness), the aggregate, the report's line shapes, the
// hard-check enumeration over the corpus, and the corpus loading through
// its shape. With the staged index and model: the hard checks on a capped
// slice and one synthetic entry through the whole pipeline. The held-out
// corpus is loaded (that is the loader's job) and never printed.

import { loadCorpus } from '@carlwr/zsh-core';
import { docCategories } from '@carlwr/zsh-core/taxonomy';
import { beforeAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { type EvalAssets, loadEvalAssets } from '../../nlp/eval/assets';
import {
  loadQaCorpus,
  QaCorpusSchema,
  QaEntrySchema,
  qaCorpusJsonSchema
} from '../../nlp/eval/qa-corpus';
import {
  aggregateScores,
  type EntryScore,
  type HardCheckResult,
  hardCheckCategories,
  hardChecks,
  hardCheckTemplates,
  renderQa,
  scoreEntry,
  scoreHardChecks,
  scoreQaCorpus,
  summaryJson
} from '../../nlp/eval/qa-score';
import { corpusResolverHit } from '../../nlp/oracle';
import type { JsonSchema } from '../../nlp/rules-schema';
import { artifactGate, STAGED } from '../_helpers';

const entry = (e: z.input<typeof QaEntrySchema>) => QaEntrySchema.parse(e);
const hit = (category: string, id: string) => ({ category, id });
const exp = (id: string, score: number, category = 'option') => ({ category, id, score });
const q = { query: 'q' };
/** A subschema, as opposed to the boolean form or a tuple `items`. */
const isSchema = (s: unknown): s is JsonSchema => typeof s === 'object' && s !== null && !Array.isArray(s);

describe('scoreEntry', () => {
  it('positive_present_scores_its_score', () => {
    const s = scoreEntry(entry({ ...q, expected: [exp('a', 2)] }), [hit('option', 'a')]);
    expect(s).toEqual<EntryScore>({ entryScore: 2, entryExpectedWeight: 2, numMatched: 1, warnings: 0 });
  });

  it('positive_absent_scores_nothing_and_warns', () => {
    const s = scoreEntry(entry({ ...q, expected: [exp('a', 2)] }), [hit('option', 'b')]);
    expect(s).toEqual<EntryScore>({ entryScore: 0, entryExpectedWeight: 2, numMatched: 0, warnings: 1 });
  });

  it('negative_absent_earns_its_magnitude', () => {
    const s = scoreEntry(entry({ ...q, expected: [exp('a', -3)] }), [hit('option', 'b')]);
    expect(s).toEqual<EntryScore>({ entryScore: 3, entryExpectedWeight: 3, numMatched: 0, warnings: 0 });
  });

  it('negative_present_penalizes_and_warns', () => {
    const s = scoreEntry(entry({ ...q, expected: [exp('a', -3)] }), [hit('option', 'a')]);
    expect(s).toEqual<EntryScore>({ entryScore: -3, entryExpectedWeight: 3, numMatched: 0, warnings: 1 });
  });

  it('duplicate_expected_scores_once_but_weighs_every_time', () => {
    const s = scoreEntry(entry({ ...q, expected: [exp('a', 1), exp('a', 1)] }), [hit('option', 'a')]);
    expect(s).toEqual<EntryScore>({ entryScore: 1, entryExpectedWeight: 2, numMatched: 1, warnings: 0 });
  });

  it('identity_is_category_and_id', () => {
    const s = scoreEntry(entry({ ...q, expected: [exp('a', 1, 'builtin')] }), [hit('option', 'a')]);
    expect(s.numMatched).toBe(0);
  });

  it('top_n_below_limit_narrows_the_scorable_window', () => {
    const matches = [hit('option', 'a'), hit('option', 'b'), hit('option', 'c')];
    const e = entry({ ...q, limit: 3, topN: 2, expected: [exp('b', 1), exp('c', 1)] });
    expect(scoreEntry(e, matches)).toMatchObject({ entryScore: 1, numMatched: 1, warnings: 1 });
  });

  it('top_n_defaults_to_limit', () => {
    const matches = [hit('option', 'a'), hit('option', 'b'), hit('option', 'c')];
    const e = entry({ ...q, limit: 2, expected: [exp('c', 1)] });
    expect(scoreEntry(e, matches)).toMatchObject({ entryScore: 0, numMatched: 0 });
  });

  it('weight_scales_score_and_expected_weight_alike', () => {
    const e = entry({ ...q, weight: 0.5, expected: [exp('a', 2), exp('b', -4)] });
    const s = scoreEntry(e, [hit('option', 'a')]);
    expect(s).toEqual<EntryScore>({ entryScore: 3, entryExpectedWeight: 3, numMatched: 1, warnings: 0 });
  });

  it('defaults_come_from_the_shape', () => {
    expect(entry({ ...q, expected: [exp('a', 1)] })).toMatchObject({ limit: 20, weight: 1 });
  });
});

describe('aggregateScores', () => {
  const score = (entryScore: number, entryExpectedWeight: number, warnings = 0): EntryScore => ({
    entryScore,
    entryExpectedWeight,
    numMatched: 0,
    warnings
  });

  it('empty_corpus_averages_zero', () => {
    expect(aggregateScores([])).toEqual({
      avgScore: 0,
      totalWeightedScore: 0,
      totalExpectedWeight: 0,
      entries: 0,
      warnings: 0
    });
  });

  it('average_is_the_ratio_of_the_totals', () => {
    const a = aggregateScores([score(1, 2, 1), score(2, 2), score(-1, 4, 1)]);
    expect(a).toEqual({
      avgScore: 0.25,
      totalWeightedScore: 2,
      totalExpectedWeight: 8,
      entries: 3,
      warnings: 2
    });
  });
});

describe('hard-check templates', () => {
  it('render_the_display_form_into_a_question', () => {
    for (const cat of hardCheckCategories()) {
      const template = hardCheckTemplates[cat];
      if (!template) throw new Error(`no template for ${cat}`);
      expect(template('XYZZY')).toMatch(/^what .*\bXYZZY\b/);
    }
  });

  it('name_doc_categories_only', () => {
    const cats = hardCheckCategories();
    expect(cats.length).toBeGreaterThan(0);
    expect(cats.every((c) => docCategories.includes(c))).toBe(true);
  });

  it('enumerate_every_record_of_a_templated_category', () => {
    const corpus = loadCorpus();
    const checks = hardChecks(corpus);
    const cats = hardCheckCategories();
    expect(checks.length).toBe(cats.reduce((n, c) => n + corpus[c].size, 0));
    // Table order across categories, corpus order within (the maps are keyed by id).
    expect([...new Set(checks.map((c) => c.category))]).toEqual(cats);
    for (const cat of cats) {
      expect(checks.filter((c) => c.category === cat).map((c) => c.id)).toEqual([...corpus[cat].keys()]);
    }
    expect(checks.every((c) => c.query.startsWith('what '))).toBe(true);
  });
});

describe('renderQa', () => {
  const hard: HardCheckResult = {
    perCat: { option: { passed: 1, total: 2 }, builtin: { passed: 3, total: 3 } },
    details: ['  FAIL: "what does the X option do" → got option/y, expected option/x'],
    passed: 4,
    total: 5,
    hardScore: 75
  };
  const scored = aggregateScores([
    { entryScore: 1.5, entryExpectedWeight: 2, numMatched: 1, warnings: 1 }
  ]);

  it('prints_the_hard_section_then_the_summary_lines', () => {
    expect(renderQa(hard, scored)).toBe(
      [
        '=== Hard checks (per-category self-retrieval) ===',
        '  FAIL: "what does the X option do" → got option/y, expected option/x',
        '',
        '  100.0%  builtin (3/3)',
        '   50.0%  option (1/2)',
        '',
        'Hard-check score (category-weighted): 75.0%  (4/5 raw)',
        '',
        'Average score: 75.0%  (1.50 / 2.00)',
        'Entries: 1',
        'Warnings: 1',
        'Hard-check score (category-weighted): 75.0%',
        'SUMMARY_JSON {"avgPercent":75,"hardPercent":75}',
        ''
      ].join('\n')
    );
  });

  it('summary_json_rounds_to_one_decimal', () => {
    const s = aggregateScores([{ entryScore: 1, entryExpectedWeight: 3, numMatched: 1, warnings: 0 }]);
    expect(summaryJson({ ...hard, hardScore: 33.333 }, s)).toEqual({ avgPercent: 33.3, hardPercent: 33.3 });
  });
});

describe('qa corpus', () => {
  it('nlp_corpus_matches_schema', async () => {
    const corpus = await loadQaCorpus();
    expect(corpus.entries.length).toBeGreaterThan(0);
  });

  it('rejects_an_unknown_entry_key_and_an_empty_expected_set', () => {
    const ok = { entries: [{ query: 'x', expected: [exp('a', 1)] }] };
    expect(QaCorpusSchema.safeParse(ok).success).toBe(true);
    expect(QaCorpusSchema.safeParse({ ...ok, $schema: './schema.json' }).success).toBe(true);
    expect(QaCorpusSchema.safeParse({ entries: [{ query: 'x', expected: [] }] }).success).toBe(false);
    expect(QaCorpusSchema.safeParse({ entries: [{ query: 'x', top: 1, expected: [exp('a', 1)] }] }).success).toBe(
      false
    );
  });

  it('emits_a_draft_2020_12_schema_with_the_authored_fields', () => {
    const s = qaCorpusJsonSchema();
    expect(s.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(s.title).toBe('NLP QA Corpus');
    expect(s.required).toEqual(['entries']);
    const entries = s.properties?.entries;
    const items = isSchema(entries) ? entries.items : undefined;
    const entryProps = (isSchema(items) ? items.properties : undefined) ?? {};
    expect(Object.keys(entryProps)).toEqual(['query', 'category', 'limit', 'topN', 'weight', 'expected']);
    expect(isSchema(entryProps.limit) && entryProps.limit.default).toBe(20);
    expect(isSchema(entryProps.weight) && entryProps.weight.default).toBe(1);
  });
});

const skipReason = artifactGate('qa score', [STAGED.index, STAGED.model]);

describe('qa scoring over the staged assets', () => {
  let assets: EvalAssets;

  beforeAll(async () => {
    if (skipReason) return;
    assets = await loadEvalAssets();
  }, 180_000);

  it('hard_checks_on_a_capped_slice_have_the_result_shape', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    const [cat] = hardCheckCategories();
    if (!cat) throw new Error('no templated category');
    const checks = hardChecks(assets.corpus)
      .filter((c) => c.category === cat)
      .slice(0, 5);
    const r = await scoreHardChecks(checks, assets, corpusResolverHit(assets.corpus));
    expect(Object.keys(r.perCat)).toEqual([cat]);
    expect(r.perCat[cat]).toEqual({ passed: r.passed, total: 5 });
    expect(r.total).toBe(5);
    expect(r.details.length).toBe(5 - r.passed);
    expect(r.hardScore).toBe((r.passed / 5) * 100);
  }, 60_000);

  it('a_synthetic_entry_runs_through_the_pipeline', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    // A canonical option form: the lookup map promotes it to #1 in either
    // mode; the negative names no record, so it is absent for sure.
    const corpus = QaCorpusSchema.parse({
      entries: [
        { query: 'AUTO_CD', category: 'option', limit: 3, expected: [exp('autocd', 1), exp('no-such-record', -1)] }
      ]
    });
    const s = await scoreQaCorpus(corpus, assets, corpusResolverHit(assets.corpus));
    expect(s).toEqual({ avgScore: 1, totalWeightedScore: 2, totalExpectedWeight: 2, entries: 1, warnings: 0 });
  }, 60_000);
});
