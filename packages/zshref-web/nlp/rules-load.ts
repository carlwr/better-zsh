// YAML → validated, normalized rules (the product `Rules` the ranker and the
// evals consume) and the JSON emit the SPA loads. The YAML is the editable
// form; the JSON is build output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { loadRules, type Rules } from '../src/lib/ranker/rules';
import { PATHS } from './paths';
import { RULE_FILES, type RuleFile } from './rules-schema';

export type RulePaths = Record<RuleFile, string>;

export const prettyJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

async function readYaml(path: string): Promise<unknown> {
  return parseYaml(await readFile(path, 'utf8'));
}

/** The three rule files, validated and normalized (synonym terms trimmed and
 * lowercased — a phrase term like `process ID` never matches the lowercased
 * haystack otherwise). */
export async function loadRulesYaml(paths: RulePaths = PATHS): Promise<Rules> {
  const [tuning, stopwords, synonyms] = await Promise.all([
    readYaml(paths.tuning),
    readYaml(paths.stopwords),
    readYaml(paths.synonyms)
  ]);
  return loadRules({ tuning, stopwords, synonyms });
}

/**
 * Write `tuning.json`, `stopwords.json`, `synonyms.json` into `dir` — the
 * validated form, so `synonyms.json` carries the normalized terms the SPA
 * replays before its own query embedding. Key order = shape order.
 */
export async function emitRulesJson(dir: string, rules?: Rules): Promise<void> {
  const r = rules ?? (await loadRulesYaml());
  await mkdir(dir, { recursive: true });
  await Promise.all(RULE_FILES.map((f) => writeFile(join(dir, `${f}.json`), prettyJson(r[f]))));
}
