// Two layers, disjoint failure modes: a red input test localises a fault
// to the data; a red output test localises it to the renderer.

import { beforeAll, describe, expect, it } from 'vitest';

import { STAGED, artifactGate, loadIndexFromDisk } from './_helpers';
import { renderInline, renderMarkdown } from '../src/lib/markdown';
import type { IndexedRecord, VectorIndex } from '../src/lib/ranker/types';

const skipReason = artifactGate('markdown rendering', [STAGED.index]);

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
// A fenced block can also open on a list-marker line, e.g. "- ```docopt"
// (member-list bullets render their sig as a fenced block). Closing fences
// are always bare same-marker lines, so the marker form is only an opener.
const LIST_FENCE = /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]+(`{3,}|~{3,})(.*)$/;

function fences(src: string): { count: number; balanced: boolean } {
  let open: { mark: string; len: number } | null = null;
  let count = 0;
  for (const line of src.split('\n')) {
    const m = FENCE.exec(line);
    if (m) {
      const run = m[1] ?? ''; // both capture groups are non-optional on a match
      const info = (m[2] ?? '').trim();
      const mark = run[0] ?? ''; // run is >= 3 fence chars
      if (!open) {
        open = { mark, len: run.length };
        count++;
      } else if (mark === open.mark && run.length >= open.len && !info) {
        open = null; // CommonMark close: bare, same marker, >= opener length
      }
      continue;
    }
    if (!open) {
      const li = LIST_FENCE.exec(line); // opener introduced on a list-marker line
      if (li) {
        const run = li[1] ?? '';
        open = { mark: run[0] ?? '', len: run.length };
        count++;
      }
    }
  }
  return { count, balanced: !open };
}

const ref = (r: IndexedRecord) => `${r.text.category}/${r.text.id}`;

describe('markdown', () => {
  let index: VectorIndex;
  beforeAll(async () => {
    if (!skipReason) index = await loadIndexFromDisk();
  }, 60_000);

  it('every md_body has balanced fences', (ctx) => {
    if (skipReason) ctx.skip(skipReason);

    const bad = index.records.filter((r) => !fences(r.text.md_body).balanced).map(ref);
    expect(bad).toEqual([]);
  });

  it('render emits one <pre> per fence, no placeholder leak', async (ctx) => {
    if (skipReason) ctx.skip(skipReason);

    const bad: string[] = [];
    for (const r of index.records) {
      const { count, balanced } = fences(r.text.md_body);
      if (!balanced) continue;
      const html = await renderMarkdown(r.text.md_body);
      const pre = (html.match(/<pre[\s>]/g) ?? []).length;
      if (pre !== count || /SHIKI_\d+/.test(html)) bad.push(`${ref(r)} pre=${pre}/${count}`);
    }
    expect(bad).toEqual([]);
  });
});

// Record titles are `{@html}`-injected (heading + result card), so these guard
// both the inline rendering and the escaping that keeps that injection safe.
// Artifact-free: pure string in, HTML out.
describe('renderInline', () => {
  it('renders inline markdown with no block wrapper', () => {
    expect(renderInline('`echo`')).toBe('<code>echo</code>');
    expect(renderInline('*file1*')).toBe('<em>file1</em>');
    expect(renderInline('plain')).toBe('plain'); // no surrounding <p>
  });

  it('escapes raw HTML so {@html} of a title stays injection-safe', () => {
    const out = renderInline('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });
});
