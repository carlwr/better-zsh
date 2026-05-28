// app.html runs a tiny inline theme script before the bundle loads (avoids a
// flash), re-implementing theme.ts's persistence by hand — it can't import TS.
// Guard the shared literals so a rename in theme.ts can't silently desync the
// pre-paint read.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const themeTs = readFileSync(resolve(webRoot, 'src/lib/theme.ts'), 'utf8');
const appHtml = readFileSync(resolve(webRoot, 'src/app.html'), 'utf8');

function fromThemeTs(re: RegExp, label: string): string {
  const v = re.exec(themeTs)?.[1];
  if (!v) throw new Error(`theme.ts: ${label} not found`);
  return v;
}

describe('theme pre-paint sync', () => {
  it.each([
    ['storage key', /STORAGE_KEY\s*=\s*'([^']+)'/],
    ['system-pref media query', /matchMedia\('([^']+)'\)/]
  ])('app.html mirrors theme.ts %s', (label, re) => {
    expect(appHtml, label).toContain(fromThemeTs(re, label));
  });
});
