// The consumer side of the lookup map: `promoteToTop` on hand-made rankings
// (the build side and the map's coverage: tests/nlp/lookup-map.test.ts).

import { describe, expect, it } from 'vitest';
import { promoteToTop } from '../src/lib/ranker/lookup-map';
import type { RankedMatch, RecordText } from '../src/lib/ranker/types';

const rec = (category: string, id: string): RecordText => ({
  category,
  category_label: category,
  id,
  display: id,
  title: '',
  md_body: '',
  structured: '',
  body: '',
  expanded: ''
});
const ranked = (): RankedMatch[] =>
  [rec('option', 'a'), rec('builtin', 'b'), rec('option', 'c')].map((r, i) => ({
    rec: r,
    score: 1 - i / 10,
    debug: {
      semantic: { structured: 0, body: 0, expanded: 0 },
      boosts: { category: 0, resolver: 0, lexical: 0 }
    }
  }));
const ids = (rs: RankedMatch[]): string[] => rs.map((m) => m.rec.id);

describe('promoteToTop', () => {
  it.each([
    ['a hit below slot 0 moves to slot 0, the rest in order', { category: 'option', id: 'c' }, ['c', 'a', 'b']],
    ['a hit already at slot 0 stays', { category: 'option', id: 'a' }, ['a', 'b', 'c']],
    ['category and id must both match', { category: 'builtin', id: 'c' }, ['a', 'b', 'c']],
    ['no hit, no change', null, ['a', 'b', 'c']]
  ])('%s', (_, hit, want) => {
    const rs = ranked();
    promoteToTop(rs, hit);
    expect(ids(rs)).toEqual(want);
  });
});
