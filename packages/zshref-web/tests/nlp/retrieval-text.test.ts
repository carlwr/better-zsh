// Mirrors the Rust unit tests in zshref-rs/src/nlp/retrieval_text.rs, plus
// the helpers' edges (whole-word matching, value compaction, hint groups).
// Pure — no corpus, no staged assets.

import { describe, expect, it } from 'vitest';

import type { Identity, JsonRecord } from '../../nlp/retrieval-text';
import {
  categoryLabel,
  compactValue,
  expandedText,
  hayHasWord,
  keyWords,
  normalizeWs,
  recordText,
  stripMarkdown
} from '../../nlp/retrieval-text';

const noGroups: string[][] = [];

describe('recordText', () => {
  it('generic_record_text_uses_structured_fields_and_body', () => {
    const rec: JsonRecord = {
      op: '-nt',
      operands: ['file1', 'file2'],
      desc: 'true if file1 exists and is newer than file2.',
      mdBody: '`-nt` *file1* `-nt` *file2*',
      _id: '-nt',
      _display: '-nt',
      _subKind: 'binary'
    };
    const text = recordText('conditional_op', rec, noGroups);
    expect(text.structured).toContain('category: conditional operator');
    expect(text.structured).toContain('operands: file1 file2');
    expect(text.body).toContain('newer than file2');
    // Expanded view always carries the category label for semantic anchoring.
    expect(text.expanded).toContain('conditional operator');
  });

  it('emits header lines, then fields in record order, skipping desc and projections', () => {
    const rec: JsonRecord = {
      name: 'autocd',
      display: 'AUTO_CD',
      flags: { char: 'J', on: '-' },
      desc: 'not in structured',
      mdBody: 'body',
      _id: 'autocd',
      _display: 'AUTO_CD',
      _title: '`AUTO_CD`'
    };
    const text = recordText('option', rec, noGroups);
    expect(text.structured).toBe(
      'category: option\ncategory id: option\nid: autocd\ndisplay: AUTO_CD\nname: autocd\ndisplay: AUTO_CD\nflags: char J on -'
    );
    expect(text.title).toBe('`AUTO_CD`');
    expect(text.md_body).toBe('body');
    expect(text.expanded).toBe('option\nautocd\nAUTO CD');
  });

  it('omits sub_kind when the record has none, and puts it after display', () => {
    const rec: JsonRecord = { _id: 'x', _display: 'x', _subKind: 'unary', mdBody: '' };
    expect(Object.keys(recordText('glob_op', rec, noGroups))).toEqual([
      'category',
      'category_label',
      'id',
      'display',
      'sub_kind',
      'title',
      'md_body',
      'structured',
      'body',
      'expanded'
    ]);
    expect(recordText('glob_op', { ...rec, _subKind: '' }, noGroups)).not.toHaveProperty('sub_kind');
    expect(recordText('glob_op', rec, noGroups).structured).toContain('display: x\nsubKind: unary');
  });

  it('body is desc verbatim (whitespace-normalized, markdown kept); else title + mdBody stripped', () => {
    const withDesc: JsonRecord = { desc: '  keeps `code`  and\n*stars*  ', mdBody: 'ignored' };
    expect(recordText('c', withDesc, noGroups).body).toBe('keeps `code` and *stars*');
    const noDesc: JsonRecord = { _title: '`foo_bar`', mdBody: 'a *b*\n\n`c`' };
    expect(recordText('c', noDesc, noGroups).body).toBe('foobar a b c');
  });
});

describe('categoryLabel', () => {
  it('category_label_rewrites_tokens_only', () => {
    expect(categoryLabel('option')).toBe('option');
    expect(categoryLabel('conditional_op')).toBe('conditional operator');
    expect(categoryLabel('process_subst')).toBe('process substitution');
  });

  it('rewrites param and expn, whole tokens only', () => {
    expect(categoryLabel('param_expn')).toBe('parameter expansion');
    expect(categoryLabel('params')).toBe('params');
  });
});

describe('hayHasWord', () => {
  it('matches whole words, ASCII case-insensitively', () => {
    expect(hayHasWord('reading the size', 'size')).toBe(true);
    expect(hayHasWord('reading the size', 'SIZE')).toBe(true);
    expect(hayHasWord('reading the size', 'read')).toBe(false);
    expect(hayHasWord('histsize', 'size')).toBe(false);
    expect(hayHasWord('a-b', 'b')).toBe(true);
  });

  it('needles with a space match as substrings', () => {
    expect(hayHasWord('the process id here', 'process id')).toBe(true);
    expect(hayHasWord('the process id here', 'ocess i')).toBe(true);
  });

  it('a single non-alphanumeric ASCII needle matches as a substring', () => {
    expect(hayHasWord('100%', '%')).toBe(true);
    expect(hayHasWord('a1', '1')).toBe(false);
    expect(hayHasWord('a1 1', '1')).toBe(true);
  });
});

describe('compactValue', () => {
  it('normalizes strings and drops blanks and nulls', () => {
    expect(compactValue('  a \n b ')).toBe('a b');
    expect(compactValue('   ')).toBeUndefined();
    expect(compactValue(null)).toBeUndefined();
  });

  it('prints booleans and integers bare', () => {
    expect(compactValue(true)).toBe('true');
    expect(compactValue(0)).toBe('0');
    expect(compactValue(2)).toBe('2');
  });

  it('joins arrays with spaces, dropping blank members', () => {
    expect(compactValue(['a', ' ', null, ['b', 'c']])).toBe('a b c');
    expect(compactValue([])).toBeUndefined();
    expect(compactValue([null, ''])).toBeUndefined();
  });

  it('flattens objects to key-value pairs with key words', () => {
    expect(compactValue({ default_in: 'zsh', char: 'J', gone: null })).toBe('default in zsh char J');
    expect(compactValue({ orderInGroup: 1, nested: { x: ['y'] } })).toBe('orderInGroup 1 nested x y');
    expect(compactValue({})).toBeUndefined();
  });
});

describe('expandedText', () => {
  const ident: Identity = {
    category: 'special_param',
    label: 'special parameter',
    id: 'HISTSIZE',
    display: '$HISTSIZE',
    subKind: 'scalar'
  };

  it('lists label and word forms once, in order, keeping case', () => {
    expect(expandedText(ident, 'the history size', noGroups)).toBe(
      'special parameter\nspecial param\nHISTSIZE\n$HISTSIZE'
    );
    expect(expandedText({ ...ident, id: 'x_y', display: 'x-y' }, '', noGroups)).toBe(
      'special parameter\nspecial param\nx y'
    );
  });

  it('appends the other members of a synonym group hit as a whole word', () => {
    const groups = [
      ['history', 'hist'],
      ['size', 'length', 'histsize'],
      ['unrelated', 'words']
    ];
    // "hist" is not a whole word in the hay; "histsize" is (from the id).
    expect(expandedText(ident, 'the history size', groups)).toBe(
      'special parameter\nspecial param\nHISTSIZE\n$HISTSIZE\nhist\nlength'
    );
  });

  it('matches group members against the lowercased hay, phrases included', () => {
    const groups = [['process id', 'pid']];
    expect(expandedText(ident, 'holds the Process ID', groups)).toContain('\npid');
    expect(expandedText(ident, 'holds the process', groups)).not.toContain('pid');
  });
});

describe('string helpers', () => {
  it('keyWords replaces underscores and hyphens, leaving camelCase', () => {
    expect(keyWords('default_in-group')).toBe('default in group');
    expect(keyWords('orderInGroup')).toBe('orderInGroup');
  });

  it('normalizeWs collapses runs and trims', () => {
    expect(normalizeWs(' a\t\tb \n c ')).toBe('a b c');
    expect(normalizeWs('\n')).toBe('');
  });

  it('stripMarkdown removes backticks, asterisks and underscores only', () => {
    expect(stripMarkdown('`a` *b* _c_ -d-')).toBe('a b c -d-');
  });
});
