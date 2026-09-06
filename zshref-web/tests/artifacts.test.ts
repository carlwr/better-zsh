// Exercises `loadArtifacts()` through a file-backed fetch.

import { describe, expect, it } from 'vitest';

import { artifactGate, PATHS, readData } from './_helpers';
import { loadArtifacts } from '../src/lib/artifacts';

const skipReason = artifactGate('artifact loader');

// Rule URLs resolve to YAML sources; `readData` handles the format switch.
const URL_TO_PATH: Record<string, string> = {
  '/artifacts/index.json': PATHS.indexJson,
  '/artifacts/rules/tuning.json': PATHS.tuning,
  '/artifacts/rules/stopwords.json': PATHS.stopwords,
  '/artifacts/rules/synonyms.json': PATHS.synonyms,
  '/artifacts/categories.json': PATHS.categoriesJson,
  '/artifacts/lookup-map.json': PATHS.lookupMap
};

// Only implements the `Response` members used by `loadArtifacts`.
const fileFetch = (async (url: RequestInfo | URL) => {
  const path = URL_TO_PATH[String(url)];
  if (!path) {
    return { ok: false, status: 404, statusText: 'unmapped', json: async () => ({}) };
  }
  return { ok: true, status: 200, statusText: 'OK', json: async () => readData(path) };
}) as unknown as typeof fetch;

describe('artifact loader', () => {
  it('loads every artifact and the taxonomy covers the index', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);

    const { index, rules, categories } = await loadArtifacts(fileFetch);

    expect(index.records.length).toBeGreaterThan(0);
    expect(index.dims).toBe(384);
    expect(categories.length).toBeGreaterThan(0);
    expect(rules.tuning.boosts.category).toBeTypeOf('number');

    // Keep result chips from falling back to raw category ids.
    const labelled = new Set(categories.map((c) => c.id));
    const inIndex = [...new Set(index.records.map((r) => r.text.category))];
    expect(inIndex.filter((c) => !labelled.has(c)), 'index categories missing from categories.json').toEqual([]);
  });
});
