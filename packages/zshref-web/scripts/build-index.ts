// Build the SPA's artifacts under static/artifacts/ (gitignored) — the set
// src/lib/artifacts.ts fetches: index.json, rules/{tuning,stopwords,
// synonyms}.json, categories.json, lookup-map.json. Everything derives from
// zsh-core's corpus and the rules YAML; only the index needs the model
// (scripts/fetch-model) and minutes of CPU, so an index that still validates
// against the corpus is kept.

import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCorpus } from '@carlwr/zsh-core';

import { categoriesJson } from '../nlp/categories';
import { createNodeEmbedder } from '../nlp/embedder-node';
import { buildIndex, type IndexValidation, readIndex, validateIndex, writeIndex } from '../nlp/index-build';
import { buildLookupMap } from '../nlp/lookup-map-build';
import { PATHS } from '../nlp/paths';
import { emitRulesJson, loadRulesYaml, prettyJson } from '../nlp/rules-load';
import { scriptFlags } from './_args';

const usage = `\
pnpm --filter zshref-web build:index [--force] [--validate]

  --force     rebuild the index even when the existing one validates
  --validate  only validate the existing index; exit 1 when it does not\
`;
const args = scriptFlags('build-index', usage, ['--force', '--validate']);

const say = (msg: string) => console.log(`build-index: ${msg}`);
const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(0)}s`;

const corpus = loadCorpus();
const rules = await loadRulesYaml();
const out = PATHS.artifactsDir;

/** The on-disk index against this corpus; an unreadable file is invalid, not fatal. */
async function existingIndex(): Promise<IndexValidation> {
  if (!existsSync(PATHS.indexJson)) return { ok: false, reason: `no index at ${PATHS.indexJson}` };
  try {
    return validateIndex(await readIndex(PATHS.indexJson), corpus, rules);
  } catch (e) {
    return { ok: false, reason: `unreadable index: ${e instanceof Error ? e.message : String(e)}` };
  }
}

const existing = await existingIndex();
if (args.has('--validate')) {
  say(existing.ok ? `index: valid for this corpus (${PATHS.indexJson})` : `index: invalid — ${existing.reason}`);
  process.exit(existing.ok ? 0 : 1);
}

if (existing.ok && !args.has('--force')) {
  say('index: valid for this corpus; kept');
} else {
  say(existing.ok ? 'index: rebuilding (--force)' : `index: ${existing.reason}; building`);
  const t0 = Date.now();
  const embedder = await createNodeEmbedder();
  say(`model loaded (${seconds(t0)}); embedding the corpus, minutes on CPU`);
  const t1 = Date.now();
  let lastReport = t1;
  const index = await buildIndex({
    corpus,
    rules,
    embedder,
    onProgress: (done, total) => {
      if (Date.now() - lastReport < 30_000 && done < total) return;
      lastReport = Date.now();
      say(`embedded ${done}/${total} texts (${seconds(t1)})`);
    }
  });
  await writeIndex(PATHS.indexJson, index);
  say(`index: ${index.records.length} records, built and validated in ${seconds(t0)}`);
}

await emitRulesJson(join(out, 'rules'), rules);
await writeFile(join(out, 'categories.json'), prettyJson(categoriesJson()));
await writeFile(join(out, 'lookup-map.json'), prettyJson(buildLookupMap(corpus)));
say(`artifacts written to ${out}`);
