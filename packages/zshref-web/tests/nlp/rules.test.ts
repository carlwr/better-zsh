// Rules loading: the committed YAML is the positive control, every negative
// case asserts the reason it fails.
// The committed editor schemas are `rulesJsonSchemas()` output; the drift
// test rewrites them under UPDATE_SCHEMAS=1 (the QA corpus schema regenerates
// under the same variable: tests/nlp/qa-score.test.ts).

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import type { z } from 'zod';

import { emitRulesJson, loadRulesYaml } from '../../nlp/rules-load';
import {
  MAX_SCORE_TERM,
  RULE_FILES,
  RULE_SCHEMAS,
  ruleSchemaFile,
  rulesJsonSchemas,
  SynonymsSchema,
  TuningSchema
} from '../../nlp/rules-schema';
import { derivedBoosts } from '../../src/lib/ranker/types';
import { assertCommittedJson, PATHS } from '../_helpers';

/** The single issue of a rejected parse — the loader reports the first
 * violation only. */
function rejection(schema: z.ZodType, yaml: string): z.core.$ZodIssue {
  const r = schema.safeParse(parseYaml(yaml));
  if (r.success) throw new Error(`expected a rejection, got ${JSON.stringify(r.data)}`);
  const [issue, ...rest] = r.error.issues;
  if (!issue || rest.length > 0) throw new Error(`expected one issue: ${r.error.message}`);
  return issue;
}

async function withTempDir(body: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'zshref-rules-'));
  try {
    await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('committed rules', () => {
  it('embedded_yaml_parses', async () => {
    const rules = await loadRulesYaml();
    // The product form: every synonym term normalized (port note: a phrase
    // term like `process ID` never matches the lowercased haystack raw).
    const { index_groups, query_expansions } = rules.synonyms;
    const terms = [...index_groups.flat(), ...query_expansions.flatMap((e) => [...e.when, e.add])];
    expect(terms.length).toBeGreaterThan(0);
    expect(terms.every((t) => t === t.trim().toLowerCase())).toBe(true);
    const { exactWord, resolver } = derivedBoosts(rules.tuning.boosts);
    expect(rules.tuning.boosts.category).toBeLessThanOrEqual(exactWord);
    expect(exactWord).toBeLessThanOrEqual(resolver);
    expect(resolver).toBeLessThanOrEqual(MAX_SCORE_TERM);
  });

  it('emit_rules_json_round_trips', async () => {
    const rules = await loadRulesYaml();
    await withTempDir(async (dir) => {
      await emitRulesJson(dir, rules);
      for (const f of RULE_FILES) {
        const text = await readFile(join(dir, `${f}.json`), 'utf8');
        expect(text.endsWith('}\n')).toBe(true);
        expect(RULE_SCHEMAS[f].parse(JSON.parse(text))).toEqual(rules[f]);
      }
    });
  });

  it('emits draft 2020-12 strict schemas, one per rule file', () => {
    const schemas = rulesJsonSchemas();
    for (const f of RULE_FILES) {
      const s = schemas[ruleSchemaFile(f)];
      expect(s.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(s.additionalProperties).toBe(false);
      expect(s.title).toBeTypeOf('string');
    }
  });

  it('schemas_match_committed_files', async () => {
    for (const [file, schema] of Object.entries(rulesJsonSchemas())) {
      await assertCommittedJson(join(PATHS.rulesSchemaDir, file), schema, 'UPDATE_SCHEMAS');
    }
  });
});

describe('synonyms.yaml', () => {
  it('index_group_with_single_member_is_rejected', () => {
    expect(rejection(SynonymsSchema, 'index_groups:\n  - [parameter]\n')).toMatchObject({
      code: 'too_small',
      path: ['index_groups', 0],
      message: 'a group needs at least 2 members'
    });
  });

  it('uppercase_and_phrase_terms_are_normalized_to_lowercase', () => {
    const src =
      'index_groups:\n  - [parameter, Variable]\n' +
      "query_expansions:\n  - { when: [PID], add: 'process ID' }\n";
    const syn = SynonymsSchema.parse(parseYaml(src));
    expect(syn.index_groups[0]).toEqual(['parameter', 'variable']);
    expect(syn.query_expansions[0]).toEqual({ when: ['pid'], add: 'process id' });
  });

  it('query_expansion_with_empty_when_is_rejected', () => {
    expect(
      rejection(SynonymsSchema, 'query_expansions:\n  - { when: [], add: option }\n')
    ).toMatchObject({ code: 'too_small', path: ['query_expansions', 0, 'when'] });
  });

  it('query_expansion_with_blank_add_is_rejected', () => {
    expect(
      rejection(SynonymsSchema, "query_expansions:\n  - { when: [setting], add: '  ' }\n")
    ).toMatchObject({
      path: ['query_expansions', 0, 'add'],
      message: 'value must not be empty'
    });
  });

  it('both_lists_may_be_omitted', () => {
    expect(SynonymsSchema.parse(parseYaml('{}\n'))).toEqual({
      index_groups: [],
      query_expansions: []
    });
  });

  it('unknown_field_is_rejected', () => {
    expect(rejection(SynonymsSchema, 'index_groups: []\nextra: nope\n')).toMatchObject({
      code: 'unrecognized_keys',
      keys: ['extra']
    });
  });
});

describe('tuning.yaml', () => {
  // The committed file is the positive control (`embedded_yaml_parses`); each
  // case below mutates one token of it so the structural priors it encodes
  // (simplex sum, ordered boost chain, positive saturation denominator) stay
  // covered branch-by-branch.
  async function rejectsTuning(from: string, to: string): Promise<z.core.$ZodIssue> {
    const src = await readFile(PATHS.tuning, 'utf8');
    const mutated = src.replace(from, to);
    expect(mutated, `replacement ${JSON.stringify(from)} matched nothing`).not.toBe(src);
    return rejection(TuningSchema, mutated);
  }

  const exceedsMax = (name: string) =>
    new RegExp(`^${name}: .* exceeds MAX_SCORE_TERM ${MAX_SCORE_TERM} `);

  it('negative_semantic_weight_is_rejected', async () => {
    expect(await rejectsTuning('body: 0.70', 'body: -0.1')).toMatchObject({
      path: ['semantic_weights'],
      message: 'body/structured must be non-negative'
    });
  });

  it('semantic_weights_summing_over_one_is_rejected', async () => {
    expect(await rejectsTuning('structured: 0.20', 'structured: 0.50')).toMatchObject({
      path: ['semantic_weights'],
      message: expect.stringMatching(/^body \+ structured must be ≤ 1/)
    });
  });

  it('nonpositive_length_scale_is_rejected', async () => {
    expect(await rejectsTuning('length_scale: 24', 'length_scale: 0')).toMatchObject({
      path: ['semantic_weights', 'short_body', 'length_scale'],
      message: 'must be positive'
    });
  });

  it('negative_short_body_strength_is_rejected', async () => {
    expect(await rejectsTuning('strength: 0.24', 'strength: -0.1')).toMatchObject({
      path: ['semantic_weights', 'short_body', 'strength'],
      message: 'must be non-negative'
    });
  });

  it('negative_boost_increment_is_rejected', async () => {
    expect(
      await rejectsTuning('exact_word_increment: 0.06', 'exact_word_increment: -0.1')
    ).toMatchObject({
      path: ['boosts'],
      message: expect.stringMatching(/^exact_word_increment\/resolver_increment must be non-negative/)
    });
  });

  it('negative_base_boost_is_rejected', async () => {
    expect(await rejectsTuning('category: 0.01', 'category: -0.1')).toMatchObject({
      path: ['boosts'],
      message: 'category/word_overlap.scale must be non-negative'
    });
  });

  it('negative_overlap_scale_is_rejected', async () => {
    expect(await rejectsTuning('scale: 0.30', 'scale: -0.1')).toMatchObject({
      path: ['boosts'],
      message: 'category/word_overlap.scale must be non-negative'
    });
  });

  it('nonpositive_half_sat_is_rejected', async () => {
    expect(await rejectsTuning('half_sat: 4.0', 'half_sat: 0')).toMatchObject({
      path: ['boosts', 'word_overlap', 'half_sat'],
      message: 'must be positive'
    });
  });

  it('boost_over_max_score_term_is_rejected', async () => {
    expect(await rejectsTuning('category: 0.01', 'category: 0.9')).toMatchObject({
      path: ['boosts', 'category'],
      message: expect.stringMatching(exceedsMax('boosts.category'))
    });
    expect(await rejectsTuning('scale: 0.30', 'scale: 0.9')).toMatchObject({
      path: ['boosts', 'word_overlap', 'scale'],
      message: expect.stringMatching(exceedsMax('boosts.word_overlap.scale'))
    });
    expect(
      await rejectsTuning('category_rarity_max: 0.0', 'category_rarity_max: 0.9')
    ).toMatchObject({
      path: ['penalties', 'category_rarity_max'],
      message: expect.stringMatching(exceedsMax('penalties.category_rarity_max'))
    });
  });

  it('effective_resolver_over_max_score_term_is_rejected', async () => {
    // The bound is on the effective term (category + increments), so a large
    // increment trips it even when each stored scalar looks small.
    expect(await rejectsTuning('resolver_increment: 0.02', 'resolver_increment: 0.9')).toMatchObject(
      {
        path: ['boosts'],
        message: expect.stringMatching(exceedsMax('boosts effective resolver'))
      }
    );
  });
});
