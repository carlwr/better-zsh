// The oracle runner: `rounded` pure, the empty-query shape without touching
// any dependency, and — with the staged index and model — the `batch
// --debug` response shape and key order on two non-holdout queries. The
// numbers themselves are pinned by the parity and sanity fixtures, not here.

import { loadCorpus } from '@carlwr/zsh-core';
import { beforeAll, describe, expect, it } from 'vitest';

import { createNodeEmbedder } from '../../nlp/embedder-node';
import { corpusResolverHit, noResolverHit, type OracleDeps, oracleSearch, rounded } from '../../nlp/oracle';
import { loadRulesYaml } from '../../nlp/rules-load';
import { loadVectorIndex } from '../../src/lib/ranker/index-loader';
import { LookupIndex, LookupMapSchema } from '../../src/lib/ranker/lookup-map';
import { artifactGate, loadIndexFromDisk, PATHS, readData, STAGED } from '../_helpers';

describe('rounded', () => {
  it('rounds to 6 decimals', () => {
    expect(rounded(0.1234564)).toBe(0.123456);
    expect(rounded(0.1234567)).toBe(0.123457);
    expect(rounded(Math.fround(0.1))).toBe(0.1);
    expect(rounded(0)).toBe(0);
  });

  it('rounds a half away from zero on both signs', () => {
    // 2.5e-6 · 1e6 is exactly 2.5 in f64; Math.round alone would give -2e-6.
    expect(rounded(2.5e-6)).toBe(3e-6);
    expect(rounded(-2.5e-6)).toBe(-3e-6);
    expect(rounded(-1.5e-6)).toBe(-2e-6);
  });
});

describe('oracleSearch', () => {
  it('returns the empty shape for a blank query, touching nothing', async () => {
    const untouched = (): never => {
      throw new Error('a blank query must not reach the embedder or the resolver');
    };
    const deps: OracleDeps = {
      index: loadVectorIndex({
        version: 2,
        model: 'none',
        dims: 0,
        normalized: true,
        corpus_hash: '',
        records: []
      }),
      rules: await loadRulesYaml(),
      lookup: new LookupIndex({ version: 1, entries: [] }),
      embedder: { embed: untouched },
      resolverHit: untouched
    };
    const out = await oracleSearch({ query: '   ' }, deps);
    expect(out).toEqual({ query: '   ', matches: [], matchesReturned: 0, matchesTotal: 0 });
    expect(Object.keys(out)).toEqual(['query', 'matches', 'matchesReturned', 'matchesTotal']);
  });
});

const skipReason = artifactGate('oracle search', [STAGED.index, STAGED.model]);

describe('oracleSearch over the staged index', () => {
  let deps: OracleDeps;

  beforeAll(async () => {
    if (skipReason) return;
    deps = {
      index: await loadIndexFromDisk(),
      rules: await loadRulesYaml(),
      lookup: new LookupIndex(LookupMapSchema.parse(await readData(PATHS.lookupMap))),
      embedder: await createNodeEmbedder(),
      resolverHit: corpusResolverHit(loadCorpus())
    };
  }, 180_000);

  const MATCH_KEYS = ['title', 'category', 'id', 'display', 'score', 'mdBody'];
  const DEBUG_KEYS = ['semantic', 'boosts', 'retrievalText'];

  it('emits the batch response shape in its fixed key order', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    const out = await oracleSearch({ query: ' AUTO_CD ', limit: 10, debug: true }, deps);
    expect(out.query).toBe(' AUTO_CD ');
    expect(Object.keys(out)).toEqual(['query', 'matches', 'matchesReturned', 'matchesTotal']);
    expect(out.matchesReturned).toBe(10);
    expect(out.matchesTotal).toBe(deps.index.records.length);
    const top = out.matches[0];
    expect(top).toMatchObject({
      title: 'option: AUTO_CD',
      category: { id: 'option', label: 'option' },
      id: 'autocd',
      display: 'AUTO_CD'
    });
    if (!top?.debug) throw new Error('--debug match without debug');
    // No subKind on an option: the key is absent, not null.
    expect(Object.keys(top)).toEqual([...MATCH_KEYS, 'debug']);
    expect(Object.keys(top.debug)).toEqual(DEBUG_KEYS);
    expect(Object.keys(top.debug.semantic)).toEqual(['structured', 'body', 'expanded']);
    expect(Object.keys(top.debug.boosts)).toEqual(['category', 'resolver', 'lexical']);
    expect(top.debug.boosts.resolver).toBeGreaterThan(0);
    const withSubKind = out.matches.find((m) => m.subKind !== undefined);
    if (withSubKind) {
      expect(Object.keys(withSubKind)).toEqual([...MATCH_KEYS.slice(0, 4), 'subKind', ...MATCH_KEYS.slice(4), 'debug']);
    }
  }, 60_000);

  it('filters by category, default limit and no debug', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    const out = await oracleSearch({ query: 'setopt builtin', category: 'builtin' }, deps);
    const builtins = deps.index.records.filter((r) => r.text.category === 'builtin').length;
    expect(out.matchesTotal).toBe(builtins);
    expect(out.matchesReturned).toBe(10);
    expect(out.matches.every((m) => m.category.id === 'builtin')).toBe(true);
    expect(out.matches.every((m) => m.debug === undefined)).toBe(true);
    expect(out.matches[0]?.id).toBe('setopt');
    expect(Object.keys(out.matches[0] ?? {})).toEqual(MATCH_KEYS);
  }, 60_000);

  it('rejects an unknown category', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    await expect(oracleSearch({ query: 'setopt', category: 'nope' }, deps)).rejects.toThrow(
      /unknown category/
    );
  });

  it('product mode differs from oracle mode by the resolver boost only', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);
    const input = { query: 'AUTO_CD', limit: 1, debug: true };
    const oracle = await oracleSearch(input, deps);
    const product = await oracleSearch(input, { ...deps, resolverHit: noResolverHit });
    const [o, p] = [oracle.matches[0], product.matches[0]];
    if (!o?.debug || !p?.debug) throw new Error('--debug match without debug');
    expect(p.id).toBe(o.id);
    expect(p.debug.boosts.resolver).toBe(0);
    expect(p.debug.semantic).toEqual(o.debug.semantic);
    expect(rounded(o.score - p.score)).toBe(o.debug.boosts.resolver);
  }, 60_000);
});
