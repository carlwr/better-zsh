// Artifact gating, on-disk loaders and the compare-or-rewrite helper shared
// by the tests. The fixture shapes live with their generators in
// nlp/fixtures.ts; the loaders are re-exported here.

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { expect } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { readIndex } from '../nlp/index-build';
import { PATHS } from '../nlp/paths';
import { prettyJson } from '../nlp/rules-load';
import type { VectorIndex } from '../src/lib/ranker/types';

export { loadParityFixture, loadSanityFixture } from '../nlp/fixtures';
export { PATHS, STAGED } from '../nlp/paths';

/**
 * Reason for `ctx.skip(reason)`; null when everything in `needs` is staged.
 * A verbose reporter prints a ctx.skip note, whereas `it.skipIf` coerces its
 * argument to a boolean and drops the text. Throws when CI requires
 * artifacts. `needs` is per-test on purpose: gating a test on the 127M model
 * it never loads makes deleting the model silently skip it.
 */
export function artifactGate(label: string, needs: readonly string[]): string | null {
  const missing = needs.filter((p) => !existsSync(p));
  if (missing.length === 0) return null;
  const msg = `${label}: not staged locally — ${missing.join(', ')}`;
  if (process.env.BZ_REQUIRE_WEB_ARTIFACTS === '1') {
    throw new Error(`${msg} (BZ_REQUIRE_WEB_ARTIFACTS=1)`);
  }
  return msg;
}

/**
 * Compare-or-rewrite for a committed, generated JSON file: with `envVar` set
 * the file is (re)written from `generated`; otherwise it must exist and equal
 * `generated` as parsed JSON (formatting is free to differ). `render` is the
 * writer, so a fixture with its own number printing round-trips through it
 * before the comparison.
 */
export async function assertCommittedJson(
  path: string,
  generated: unknown,
  envVar: string,
  render: (value: unknown) => string = prettyJson
): Promise<void> {
  const text = render(generated);
  if (process.env[envVar] === '1') {
    await writeFile(path, text);
    return;
  }
  if (!existsSync(path)) {
    throw new Error(`${path} is missing — generate it with ${envVar}=1`);
  }
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(JSON.parse(text));
}

export async function readData(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8');
  return path.endsWith('.yaml') ? parseYaml(text) : JSON.parse(text);
}

/** The staged index, schema-validated (not corpus-validated: that is `validateIndex`'s test). */
export const loadIndexFromDisk = (): Promise<VectorIndex> => readIndex(PATHS.indexJson);
