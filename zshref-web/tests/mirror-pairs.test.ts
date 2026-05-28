/**
 * Web-namespace mirror-link integrity. Scans `.rs` and `.ts` sources for
 * `WEB-MIRRORED-IN:` / `WEB-MIRROR-OF:` markers; asserts host-extension
 * match, target existence, and pair symmetry. The markers are the SoT —
 * there's no `parity-units.ts` mirror today (one ranker pair); the runtime
 * contract is `tests/parity.test.ts`. Skips when `zshref-rs/` is absent.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Host-extension SoT: drives marker kind, host-check, and edge canonicalisation. */
const HOST_EXT = {
  'WEB-MIRRORED-IN': '.rs',
  'WEB-MIRROR-OF': '.ts'
} as const;
type MarkerKind = keyof typeof HOST_EXT;

const SCAN_ROOTS = ['zshref-rs', 'zshref-web'] as const;
const SKIP_DIRS: ReadonlySet<string> = new Set([
  '.git', '.svelte-kit', 'build', 'dist', 'node_modules', 'target'
]);
const MARKER_RE = /^\/\/\s+(WEB-MIRRORED-IN|WEB-MIRROR-OF):\s+(\S+)\s*$/;
const SOURCE_RE = /(?<!\.d)\.(ts|rs)$/;

interface Marker {
  readonly kind: MarkerKind;
  readonly source: string;
  readonly target: string;
}

function* walkSources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkSources(path);
    else if (SOURCE_RE.test(path)) yield path;
  }
}

function scan(): readonly Marker[] {
  const out: Marker[] = [];
  for (const root of SCAN_ROOTS) {
    const abs = join(repoRoot, root);
    if (!existsSync(abs)) continue;
    for (const file of walkSources(abs)) {
      const source = relative(repoRoot, file);
      for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = MARKER_RE.exec(line);
        if (m) out.push({ kind: (m[1] ?? '') as MarkerKind, source, target: m[2] ?? '' });
      }
    }
  }
  return out;
}

/** Canonical rs→ts edge: `-IN:` has rs as source, `-OF:` has rs as target. */
const rsTsEdge = (m: Marker): string =>
  m.kind === 'WEB-MIRRORED-IN' ? `${m.source}\0${m.target}` : `${m.target}\0${m.source}`;

const rsPresent = existsSync(join(repoRoot, 'zshref-rs'));
const markers = rsPresent ? scan() : [];

describe.skipIf(!rsPresent)('web mirror-pairs', () => {
  test('kind matches host extension', () => {
    for (const m of markers) {
      expect(extname(m.source), `${m.kind} on ${m.source}`).toBe(HOST_EXT[m.kind]);
    }
  });

  test('every target exists', () => {
    for (const m of markers) {
      expect(existsSync(join(repoRoot, m.target)), `${m.kind} → ${m.target}`).toBe(true);
    }
  });

  test('IN and OF derive the same rs→ts edge set', () => {
    const ins = markers.filter((m) => m.kind === 'WEB-MIRRORED-IN').map(rsTsEdge).sort();
    const ofs = markers.filter((m) => m.kind === 'WEB-MIRROR-OF').map(rsTsEdge).sort();
    expect(ofs).toEqual(ins);
  });

  test('at least one pair exists', () => {
    expect(markers.length, 'no WEB-MIRROR markers found').toBeGreaterThan(0);
  });
});
