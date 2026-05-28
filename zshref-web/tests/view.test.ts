import { describe, expect, it } from 'vitest';

import {
  findRecord,
  recordHref,
  recordKey,
  recordView,
  summaryLine,
  viewState,
  type RecordView,
  type RecordViewInputs,
  type ViewInputs,
  type ViewState
} from '../src/lib/view';
import { makeRecordText } from './_fixtures';

// Baseline: each case flips the minimal fields to claim its branch.
const RESULTS: ViewInputs = {
  artifactsErr: '',
  hasArtifacts: true,
  searching: false,
  embedderReady: true,
  searchErr: '',
  firstRun: false,
  matchCount: 3
};

describe('viewState', () => {
  it.each<[ViewState['kind'], Partial<ViewInputs>]>([
    ['results', {}],
    ['artifacts-error', { artifactsErr: 'boom' }],
    ['loading-artifacts', { hasArtifacts: false }],
    ['searching-cold', { searching: true, embedderReady: false }],
    ['searching', { searching: true }],
    ['search-error', { searchErr: 'nope' }],
    ['prompt', { firstRun: true }],
    ['empty', { matchCount: 0 }]
  ])('claims %s', (kind, patch) => {
    expect(viewState({ ...RESULTS, ...patch }).kind).toBe(kind);
  });

  it('artifacts error outranks all', () => {
    const v = viewState({
      artifactsErr: 'boom',
      hasArtifacts: false,
      searching: true,
      embedderReady: false,
      searchErr: 'nope',
      firstRun: true,
      matchCount: 0
    });
    expect(v.kind).toBe('artifacts-error');
  });

  it('cold search outranks stale error', () => {
    const v = viewState({ ...RESULTS, searching: true, embedderReady: false, searchErr: 'stale' });
    expect(v.kind).toBe('searching-cold');
  });

  it('error branches carry the message', () => {
    expect(viewState({ ...RESULTS, artifactsErr: 'disk gone' })).toEqual({
      kind: 'artifacts-error',
      message: 'disk gone'
    });
    expect(viewState({ ...RESULTS, searchErr: 'embed failed' })).toEqual({
      kind: 'search-error',
      message: 'embed failed'
    });
  });
});

describe('summaryLine', () => {
  it.each([
    [3, 10, 'top 3 of 10 records'],
    [10, 10, '10 records'],
    [1, 1, '1 record'],
    [0, 0, '0 records']
  ])('shown=%i total=%i → "%s"', (shown, total, expected) => {
    expect(summaryLine(shown, total)).toBe(expected);
  });
});

describe('record links', () => {
  const rec = { category: 'builtin', id: 'typeset' };

  it('href is the permalink', () => {
    expect(recordHref(rec)).toBe('/r/builtin/typeset');
  });

  it('key is category+id', () => {
    expect(recordKey(rec)).toBe('builtin/typeset');
    expect(recordKey({ category: 'param', id: 'typeset' })).not.toBe(recordKey(rec));
  });
});

describe('findRecord', () => {
  // Two 'echo's in different categories — the collision the match resolves.
  const records = [
    { text: { category: 'builtin', id: 'echo' } },
    { text: { category: 'param', id: 'PATH' } },
    { text: { category: 'param', id: 'echo' } }
  ];

  it('matches category+id, not id alone', () => {
    expect(findRecord(records, 'param', 'echo')).toBe(records[2]);
  });

  it('undefined when no match', () => {
    expect(findRecord(records, 'builtin', 'PATH')).toBeUndefined();
  });
});

describe('recordView', () => {
  const record = makeRecordText({ category: 'builtin', id: 'echo' });
  const FOUND: RecordViewInputs = {
    loadError: '',
    ready: true,
    found: record,
    categories: [{ id: 'builtin', label: 'Builtins' }],
    category: 'builtin',
    id: 'echo'
  };

  it.each<[RecordView['kind'], Partial<RecordViewInputs>]>([
    ['record', {}],
    ['load-error', { loadError: 'disk gone' }],
    ['loading', { ready: false, found: undefined }],
    ['not-found', { found: undefined }]
  ])('claims %s', (kind, patch) => {
    expect(recordView({ ...FOUND, ...patch }).kind).toBe(kind);
  });

  it('load error outranks all', () => {
    const v = recordView({ ...FOUND, loadError: 'boom', ready: false, found: undefined });
    expect(v.kind).toBe('load-error');
  });

  it('not-found names the permalink', () => {
    expect(recordView({ ...FOUND, found: undefined, category: 'param', id: 'PATH' })).toEqual({
      kind: 'not-found',
      message: 'no record at /r/param/PATH'
    });
  });

  it('record branch resolves the label', () => {
    expect(recordView(FOUND)).toMatchObject({ kind: 'record', label: 'Builtins', record });
  });
});
