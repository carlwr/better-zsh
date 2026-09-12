// Mirrors the unit tests of zshref-rs/src/nlp/sentence_fixture.rs: the
// metric on synthetic votes, the fixture shape on inline YAML, the committed
// fixture loaded blind (counts and record existence only — nothing of an
// entry is printed), and — with the staged index and model — the eval report,
// aggregates only. The eval chain itself (rank → promote → own-rank vote,
// missing item past the end) runs over the parity fixture's miniature index,
// so it needs no model.

import { loadCorpus } from '@carlwr/zsh-core';
import { docCategories } from '@carlwr/zsh-core/taxonomy';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { loadEvalAssets } from '../../nlp/eval/assets';
import { BETA, gain, type Split, score, scoreSplit, type Vote } from '../../nlp/eval/metric';
import { evalSentence, evalSentenceCached, renderSentence } from '../../nlp/eval/sentence';
import {
  DEFAULT_TARGET_DEPTH,
  DEFAULT_WEIGHT,
  loadSentenceFixture,
  parseSentenceFixture,
  SENTENCE_FIXTURE_VERSION,
  SentenceFixtureSchema
} from '../../nlp/eval/sentence-fixture';
import { buildParityIndex, syntheticVec } from '../../nlp/fixtures';
import { corpusResolverHit, noResolverHit } from '../../nlp/oracle';
import { loadRulesYaml } from '../../nlp/rules-load';
import { rulesJsonSchemas, SENTENCE_FIXTURE_SCHEMA_FILE } from '../../nlp/rules-schema';
import { LookupIndex } from '../../src/lib/ranker/lookup-map';
import { artifactGate, STAGED } from '../_helpers';

const corpus = loadCorpus();

const vote = (category: string, weight: number, gain: number, split: Split): Vote => ({
  category,
  weight,
  gain,
  split
});

const versioned = (body: string): string => `version: ${SENTENCE_FIXTURE_VERSION}\n${body}`;

describe('committed sentence fixture', () => {
  it('sentence_fixture_loads_and_validates', async () => {
    const f = await loadSentenceFixture();
    expect(f.entries.length).toBeGreaterThan(0);
    // Shape spot-check; the load invariants did the rest.
    for (const e of f.entries) {
      expect(e.query.trim()).not.toBe('');
      for (const item of e.want) expect(item.weight).toBeGreaterThan(0);
    }
  });

  /** Every expected item names a corpus record. Pure on the corpus. A
   * missing holdout item is reported by position only. */
  it('sentence_fixture_expected_records_exist', async () => {
    const f = await loadSentenceFixture();
    const known = new Map(docCategories.map((cat) => [cat as string, new Set<string>(corpus[cat].keys())]));
    const missing = f.entries.flatMap((e, i) =>
      e.want.flatMap((item, j) => {
        if (known.get(item.category)?.has(item.id)) return [];
        const at = `entry ${i} item ${j}`;
        return [e.split === 'train' ? `${at}: ${item.category}/${item.id} — no such record` : `${at} (holdout)`];
      })
    );
    expect(missing).toEqual([]);
  });

  it('emits the editor schema with the rule schemas', () => {
    const s = rulesJsonSchemas()[SENTENCE_FIXTURE_SCHEMA_FILE];
    expect(s.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(s.title).toBe('SentenceFixture');
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(['version', 'entries']);
  });
});

describe('sentence eval report', () => {
  const skipReason = artifactGate('sentence eval report', [STAGED.index, STAGED.model]);

  // The Rust reporter ran with the resolver hit; product mode (no hit) is
  // the default once the port's gates are passed (nlp-move.md §Decisions).
  it('sentence_fixture_eval_report', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    const assets = await loadEvalAssets();
    const r = await evalSentence(await loadSentenceFixture(), assets, corpusResolverHit(assets.corpus));
    console.log(renderSentence(r).trimEnd());
    expect(Number.isFinite(r.all.total)).toBe(true);
    expect(r.all.total).toBeGreaterThanOrEqual(0);
    expect(r.all.total).toBeLessThanOrEqual(1);
  }, 180_000);
});

describe('score', () => {
  it('score_is_per_category_normalized', () => {
    // A: 10 votes, all hit; B: 1 vote, a miss. Total (1 + 0) / 2, whatever
    // the per-category vote counts.
    const votes = Array.from({ length: 10 }, () => vote('A', 1, 1, 'train'));
    votes.push(vote('B', 1, 0, 'train'));
    const s = score(votes);
    expect(s.total).toBeCloseTo(0.5, 6);
    expect(s.perCategory.get('A')).toBeCloseTo(1, 6);
    expect(s.perCategory.get('B')).toBeCloseTo(0, 6);
  });

  it('score_respects_vote_weights', () => {
    // One category: a hit at weight 3, a miss at weight 1 → 3/4.
    const s = score([vote('X', 3, 1, 'train'), vote('X', 1, 0, 'train')]);
    expect(s.total).toBeCloseTo(0.75, 6);
  });

  it('score_split_partitions_by_split', () => {
    const votes = [vote('X', 1, 0, 'train'), vote('X', 1, 1, 'holdout')];
    expect(scoreSplit(votes, 'train').total).toBeCloseTo(0, 6);
    expect(scoreSplit(votes, 'holdout').total).toBeCloseTo(1, 6);
  });

  it('scores nothing as zero, categories in byte order', () => {
    expect(score([])).toEqual({ perCategory: new Map(), total: 0 });
    const s = score([vote('b', 1, 1, 'train'), vote('B', 1, 0, 'train'), vote('a', 1, 1, 'train')]);
    expect([...s.perCategory.keys()]).toEqual(['B', 'a', 'b']);
  });
});

describe('gain', () => {
  it('discount_g_is_normalized_and_monotone', () => {
    // gain(1) == 1 whatever the target depth.
    for (const d of [1, 3, 5]) expect(gain(1, d, BETA)).toBeCloseTo(1, 6);
    // Decreasing in the rank, staying positive (polynomial tail).
    expect(gain(100, 1, 2)).toBeGreaterThan(gain(1000, 1, 2));
    expect(gain(1000, 1, 2)).toBeGreaterThan(0);
    // At rank == d: (1 + (1/d)^β) / 2.
    for (const d of [2, 4]) expect(gain(d, d, BETA)).toBeCloseTo((1 + (1 / d) ** BETA) / 2, 6);
  });
});

describe('fixture shape', () => {
  it('item_override_resolution', () => {
    const f = parseSentenceFixture(
      versioned('entries:\n  - query: alpha\n    want:\n      - { cat: a0, id: X, d: 5, w: 7 }\n      - { cat: a0, id: Y }\n')
    );
    expect(f.entries[0]?.want).toEqual([
      { category: 'a0', id: 'X', targetDepth: 5, weight: 7 },
      { category: 'a0', id: 'Y', targetDepth: DEFAULT_TARGET_DEPTH, weight: DEFAULT_WEIGHT }
    ]);
  });

  it('omitted_item_values_inherit_fixture_defaults', () => {
    const f = parseSentenceFixture(
      versioned(
        'default-weight: 2.0\ndefault-target-depth: 5.0\nentries:\n  - query: alpha\n    want:\n      - {cat: c, id: i}\n      - {cat: c, id: j, w: 0.5, d: 1}\n'
      )
    );
    expect(f.defaultWeight).toBe(2);
    expect(f.defaultTargetDepth).toBe(5);
    const [omitted, explicit] = f.entries[0]?.want ?? [];
    expect(omitted).toMatchObject({ weight: 2, targetDepth: 5 });
    expect(explicit).toMatchObject({ weight: 0.5, targetDepth: 1 });
  });

  it('fixture_defaults_fall_back_when_omitted', () => {
    const f = parseSentenceFixture(versioned('entries:\n  - query: alpha\n    want: [{cat: c, id: i}]\n'));
    expect(f.defaultWeight).toBe(1);
    expect(f.defaultTargetDepth).toBe(3);
    expect(f.entries[0]?.want[0]).toMatchObject({ weight: 1, targetDepth: 3 });
  });

  it('holdout_flag_drives_split', () => {
    const f = parseSentenceFixture(
      versioned(
        'entries:\n  - query: a\n    want: [{cat: c, id: i}]\n  - query: b\n    want: [{cat: c, id: j}]\n    holdout: true\n  - query: c\n    want: [{cat: c, id: k}]\n    holdout: false\n'
      )
    );
    expect(f.entries.map((e) => e.split)).toEqual(['train', 'holdout', 'train']);
  });

  it('rejects a stale version, an empty want-set, a non-positive value, an unknown key', () => {
    const paths = (yaml: string): string[] => {
      const r = SentenceFixtureSchema.safeParse(parseYaml(yaml));
      if (r.success) throw new Error('expected a rejection');
      return r.error.issues.map((i) => i.path.join('.'));
    };
    const entry = 'entries:\n  - query: a\n    want: [{cat: c, id: i}]\n';
    expect(paths(`version: ${SENTENCE_FIXTURE_VERSION - 1}\n${entry}`)).toEqual(['version']);
    expect(paths(versioned('entries:\n  - query: a\n    want: []\n'))).toEqual(['entries.0.want']);
    expect(paths(versioned('entries:\n  - query: a\n    want: [{cat: c, id: i, d: 0}]\n'))).toEqual([
      'entries.0.want.0.d'
    ]);
    expect(paths(versioned(`default-weight: -1\n${entry}`))).toEqual(['default-weight', 'entries.0.want.0.w']);
    expect(paths(versioned(`${entry}    extra: 1\n`))).toEqual(['entries.0']);
  });
});

describe('eval over the parity index', () => {
  it('multi_item_entry_yields_one_vote_per_item', async () => {
    const rules = await loadRulesYaml();
    const index = buildParityIndex(corpus, rules.synonyms.index_groups);
    const assets = { index, rules, lookup: new LookupIndex({ version: 1, entries: [] }) };
    // Three items in one category at a depth far past the index's few
    // records, so each gains exactly 1 in f32 whatever its rank; a fourth
    // the index lacks counts as ranked just past the end.
    const query = 'alpha';
    const fixture = parseSentenceFixture(
      versioned(
        `default-target-depth: 1000000\nentries:\n  - query: ${query}\n    want:\n      - {cat: option, id: autocd}\n      - {cat: option, id: extendedglob}\n      - {cat: option, id: globdots}\n      - {cat: builtin, id: echo, d: 3}\n`
      )
    );
    const vecs = new Map([[query, syntheticVec(['query', query])]]);
    const r = evalSentenceCached(fixture, vecs, assets, noResolverHit);
    expect(r.nEntries).toBe(1);
    expect(r.perCategoryN.get('option')).toBe(3);
    expect(r.perCategoryN.get('builtin')).toBe(1);
    expect(r.all.perCategory.get('option')).toBe(1);
    const missingGain = gain(index.records.length + 1, 3);
    expect(r.all.perCategory.get('builtin')).toBe(missingGain);
    expect(r.all.total).toBeCloseTo((1 + missingGain) / 2, 6);
    expect(r.train.total).toBe(r.all.total);
    expect(r.holdout.total).toBe(0);
    expect(renderSentence(r)).toBe(
      `[sentence-fixture] total=${r.all.total.toFixed(3)}  train=${r.all.total.toFixed(3)}  holdout=0.000 (overfit-watch — never tune on this)  (1 entries)\n` +
        `  builtin              ${missingGain.toFixed(3)}  (n=1)\n` +
        '  option               1.000  (n=3)\n'
    );
  });
});
