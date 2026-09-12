// The zshref-rs/src/nlp/query_expand.rs unit tests by name, then properties
// over generated rule sets and queries.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { expandQueryForEmbedding } from '../src/lib/ranker/query-expand';
import type { QueryExpansion } from '../src/lib/ranker/types';

const rule = (when: string[], add: string): QueryExpansion => ({ when, add });

describe('expandQueryForEmbedding', () => {
  it('appends_canonical_on_trigger', () => {
    const rules = [rule(['setting', 'settings'], 'option')];
    expect(expandQueryForEmbedding('toggle a setting', rules)).toBe('toggle a setting option');
  });

  it('no_trigger_leaves_query_untouched', () => {
    const rules = [rule(['setting'], 'option')];
    expect(expandQueryForEmbedding('list aliases', rules)).toBe('list aliases');
  });

  it('canonical_already_present_is_not_appended', () => {
    const rules = [rule(['setting'], 'option')];
    // "options" is a different word; "option" as a whole word is present here,
    // so the exact canonical word blocks the append.
    expect(expandQueryForEmbedding('setting option', rules)).toBe('setting option');
  });

  it('whole_word_only_no_substring_trigger', () => {
    const rules = [rule(['env'], 'environment')];
    // "prevent" contains "env" as a substring but not as a word.
    expect(expandQueryForEmbedding('prevent errors', rules)).toBe('prevent errors');
  });

  it('append_count_is_capped', () => {
    const rules = [rule(['a'], 'one'), rule(['b'], 'two'), rule(['c'], 'three')];
    expect(expandQueryForEmbedding('a b c', rules)).toBe('a b c one two');
  });
});

// --- properties ---------------------------------------------------------------

// Lowercase alphanumeric words, so a term compares as it is stored (the
// loader lowercases) and the whole-word split is the only tokenization.
const arbWord = fc.stringMatching(/^[a-z0-9]{1,6}$/);
const arbTerm = fc.oneof({ weight: 3, arbitrary: arbWord }, fc.tuple(arbWord, arbWord).map((ws) => ws.join(' ')));
const arbRules = fc.array(
  fc.record({ when: fc.array(arbTerm, { minLength: 1, maxLength: 3 }), add: arbWord }),
  { maxLength: 6 }
);
// Words from the same small alphabet, so triggers and canonical terms
// actually occur; the casing noise must not matter.
const arbQuery = fc
  .array(arbWord.map((w) => (w.length > 2 ? w.toUpperCase() : w)), { maxLength: 6 })
  .map((ws) => ws.join(' '));

const words = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0);
const wordIn = (hay: string, needle: string): boolean =>
  needle.includes(' ') ? hay.toLowerCase().includes(needle) : words(hay).includes(needle);
/** The terms `expanded` appended to `query`. */
const appended = (query: string, expanded: string): string[] => {
  expect(expanded.startsWith(query)).toBe(true);
  return expanded === query ? [] : words(expanded.slice(query.length));
};

describe('expandQueryForEmbedding properties', () => {
  it('is deterministic and append-only: ≤ 2 distinct canonical terms absent from the query', () => {
    fc.assert(
      fc.property(arbRules, arbQuery, (rules, q) => {
        const e = expandQueryForEmbedding(q, rules);
        expect(expandQueryForEmbedding(q, rules)).toBe(e);
        const adds = appended(q, e);
        expect(adds.length).toBeLessThanOrEqual(2);
        expect(new Set(adds).size).toBe(adds.length);
        for (const a of adds) {
          expect(rules.some((r) => r.add === a)).toBe(true);
          expect(wordIn(q, a)).toBe(false);
        }
      })
    );
  });

  it('re-expanding appends nothing already present; nothing at all below the cap, chains aside', () => {
    fc.assert(
      fc.property(arbRules, arbQuery, (rules, q) => {
        const e1 = expandQueryForEmbedding(q, rules);
        const e2 = expandQueryForEmbedding(e1, rules);
        const again = appended(e1, e2);
        expect(again.length).toBeLessThanOrEqual(2);
        for (const a of again) expect(wordIn(e1, a)).toBe(false);
        // Below the cap, every firing rule's term is already in e1 — unless
        // an appended term is itself a trigger (a chain), which may fire anew.
        const chained = rules.some((r) => r.when.some((w) => !wordIn(q, w) && wordIn(e1, w)));
        if (appended(q, e1).length < 2 && !chained) expect(e2).toBe(e1);
      })
    );
  });
});
