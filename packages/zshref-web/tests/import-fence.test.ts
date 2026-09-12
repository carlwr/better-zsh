// The browser/Node seam. `src/` is the browser bundle; the Node-side NLP
// (corpus access, index build, evals, fixtures) lives in `nlp/`, `scripts/`
// and `tests/`. Nothing under `src/` may import `@carlwr/zsh-core` (any
// subpath), a Node builtin (`node:*` or bare), the Node ONNX runtime, the
// YAML or tsx tooling, or a relative path that leaves `src/` (`../nlp`).
// Type-only imports count too: the seam is absolute, and `nlp/` already
// imports its types from `src/`, the sanctioned direction. `vite build` is
// the other half of the fence — this test names the offender before the
// bundle breaks.

import { readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const SOURCE_RE = /\.(ts|mts|js|mjs|svelte)$/;

// Static `from '…'` (import and re-export), dynamic `import('…')`, and
// side-effect `import '…'`.
const SPECIFIER_RES = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /^\s*import\s+['"]([^'"]+)['"]/gm
];

const FORBIDDEN_PACKAGES = ['@carlwr/zsh-core', 'onnxruntime-node', 'yaml', 'tsx'];
const NODE_BUILTINS: ReadonlySet<string> = new Set(builtinModules);

interface Import {
  file: string;
  line: number;
  specifier: string;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (SOURCE_RE.test(entry.name)) yield path;
  }
}

function importsOf(file: string): Import[] {
  const text = readFileSync(file, 'utf8');
  const out: Import[] = [];
  for (const re of SPECIFIER_RES) {
    for (const m of text.matchAll(re)) {
      const line = text.slice(0, m.index).split('\n').length;
      out.push({ file, line, specifier: m[1] ?? '' });
    }
  }
  return out;
}

const isPackage = (spec: string, pkg: string): boolean => spec === pkg || spec.startsWith(`${pkg}/`);

/** Why `specifier`, imported from `file`, breaches the fence; null if it does not. */
function breach(file: string, specifier: string): string | null {
  if (specifier.startsWith('node:')) return 'Node builtin';
  if (NODE_BUILTINS.has(specifier) || NODE_BUILTINS.has(specifier.split('/')[0] ?? '')) {
    return 'Node builtin';
  }
  const pkg = FORBIDDEN_PACKAGES.find((p) => isPackage(specifier, p));
  if (pkg) return `Node-side package ${pkg}`;
  if (specifier.startsWith('.')) {
    const target = resolve(dirname(file), specifier);
    const rel = relative(srcDir, target);
    if (rel.startsWith('..')) return 'leaves src/';
  }
  return null;
}

describe('import fence', () => {
  const imports = [...walk(srcDir)].flatMap(importsOf);

  it('sees the bundle', () => {
    // A scanner that finds nothing would pass vacuously.
    expect(imports.length).toBeGreaterThan(10);
  });

  it('src/ imports nothing from the Node side', () => {
    const offenders = imports.flatMap((i) => {
      const why = breach(i.file, i.specifier);
      return why ? [`${relative(srcDir, i.file)}:${i.line}  ${i.specifier}  (${why})`] : [];
    });
    expect(offenders, `imports crossing the src/ fence:\n${offenders.join('\n')}`).toEqual([]);
  });

  const lib = join(srcDir, 'lib', 'x.ts');
  it.each([
    ['node:fs', 'Node builtin'],
    ['fs/promises', 'Node builtin'],
    ['path', 'Node builtin'],
    ['@carlwr/zsh-core', 'Node-side package @carlwr/zsh-core'],
    ['@carlwr/zsh-core/taxonomy', 'Node-side package @carlwr/zsh-core'],
    ['onnxruntime-node', 'Node-side package onnxruntime-node'],
    ['yaml', 'Node-side package yaml'],
    ['../../nlp/paths', 'leaves src/'],
    ['../../tests/_helpers', 'leaves src/'],
    ['./ranker/rank', null],
    ['../app.css', null],
    ['$lib/search', null],
    ['$app/state', null],
    ['@huggingface/transformers', null],
    ['zod', null]
  ])('classifies %s as %s', (specifier, why) => {
    expect(breach(lib, specifier)).toBe(why);
  });
});
