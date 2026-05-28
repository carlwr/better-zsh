// Mirrors the Rust unit tests in zshref-rs/src/nlp/query_expand.rs.

import { describe, expect, it } from 'vitest';

import { expandQueryForEmbedding } from '../src/lib/ranker/query-expand';
import type { QueryExpansion } from '../src/lib/ranker/types';

const rule = (when: string[], add: string): QueryExpansion => ({ when, add });

describe('expandQueryForEmbedding', () => {
  it('appends the canonical term on trigger', () => {
    const rules = [rule(['setting', 'settings'], 'option')];
    expect(expandQueryForEmbedding('toggle a setting', rules)).toBe('toggle a setting option');
  });

  it('leaves the query untouched when nothing triggers', () => {
    const rules = [rule(['setting'], 'option')];
    expect(expandQueryForEmbedding('list aliases', rules)).toBe('list aliases');
  });

  it('does not append a canonical term already present as a whole word', () => {
    const rules = [rule(['setting'], 'option')];
    // "options" is a different word; "option" as a whole word is present here,
    // so the exact canonical word blocks the append.
    expect(expandQueryForEmbedding('setting option', rules)).toBe('setting option');
  });

  it('matches whole words only — no substring trigger', () => {
    const rules = [rule(['env'], 'environment')];
    // "prevent" contains "env" as a substring but not as a word.
    expect(expandQueryForEmbedding('prevent errors', rules)).toBe('prevent errors');
  });

  it('caps the number of appended terms at 2', () => {
    const rules = [rule(['a'], 'one'), rule(['b'], 'two'), rule(['c'], 'three')];
    expect(expandQueryForEmbedding('a b c', rules)).toBe('a b c one two');
  });
});
