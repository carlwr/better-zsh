// Shared fixtures. Pure (no IO); excluded from the test glob (not *.test.ts).

import type { RecordText } from '../src/lib/ranker/types';

export function makeRecordText(over: Partial<RecordText> = {}): RecordText {
  return {
    category: 'builtin',
    category_label: 'Builtins',
    id: 'echo',
    display: 'echo',
    title: '`echo`',
    md_body: 'irrelevant',
    structured: '',
    body: '',
    expanded: '',
    ...over
  };
}
