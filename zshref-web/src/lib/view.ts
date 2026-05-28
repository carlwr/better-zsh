// Pure page-presentation logic: testable without a DOM, templates are thin
// switches over it. Same posture as markdown.ts.

import { categoryLabel, type Category } from './artifacts';
import type { RecordText } from './ranker/types';

// Check order is the contract: earlier wins, so an error or cold embedder is
// never masked by a later results/empty branch.
export type ViewState =
  | { kind: 'artifacts-error'; message: string }
  | { kind: 'loading-artifacts' }
  | { kind: 'searching-cold' } // model still downloading
  | { kind: 'searching' }
  | { kind: 'search-error'; message: string }
  | { kind: 'prompt' }
  | { kind: 'empty' }
  | { kind: 'results' };

export interface ViewInputs {
  artifactsErr: string;
  hasArtifacts: boolean;
  searching: boolean;
  embedderReady: boolean;
  searchErr: string;
  firstRun: boolean;
  matchCount: number;
}

export function viewState(s: ViewInputs): ViewState {
  if (s.artifactsErr) return { kind: 'artifacts-error', message: s.artifactsErr };
  if (!s.hasArtifacts) return { kind: 'loading-artifacts' };
  if (s.searching && !s.embedderReady) return { kind: 'searching-cold' };
  if (s.searching) return { kind: 'searching' };
  if (s.searchErr) return { kind: 'search-error', message: s.searchErr };
  if (s.firstRun) return { kind: 'prompt' };
  if (s.matchCount === 0) return { kind: 'empty' };
  return { kind: 'results' };
}

// Every record is scored, so `total` is the corpus/category size, not a hit
// count — a truncated list reads as a ranking, a full list as a count.
export function summaryLine(shown: number, total: number): string {
  if (shown < total) return `top ${shown} of ${total} records`;
  return `${total} ${total === 1 ? 'record' : 'records'}`;
}

type RecordRef = Pick<RecordText, 'category' | 'id'>;

export function recordHref(rec: RecordRef): string {
  return `/r/${rec.category}/${rec.id}`;
}

export function recordKey(rec: RecordRef): string {
  return `${rec.category}/${rec.id}`;
}

// Match category AND id: an id recurs across categories. Generic so tests pass
// {text:{category,id}}, not full index vectors.
export function findRecord<T extends { text: RecordRef }>(
  records: readonly T[],
  category: string,
  id: string
): T | undefined {
  return records.find((r) => r.text.category === category && r.text.id === id);
}

// not-found is distinct from load-error: a stale deep link is expected (render
// calmly), a load failure is a fault. Load failure outranks all, as on search.
export type RecordView =
  | { kind: 'loading' }
  | { kind: 'load-error'; message: string }
  | { kind: 'not-found'; message: string }
  | { kind: 'record'; record: RecordText; label: string };

export interface RecordViewInputs {
  loadError: string;
  ready: boolean; // artifacts resolved
  found: RecordText | undefined;
  categories: Category[];
  category: string;
  id: string;
}

export function recordView(s: RecordViewInputs): RecordView {
  if (s.loadError) return { kind: 'load-error', message: s.loadError };
  if (!s.ready) return { kind: 'loading' };
  if (!s.found) return { kind: 'not-found', message: `no record at /r/${s.category}/${s.id}` };
  return { kind: 'record', record: s.found, label: categoryLabel(s.categories, s.found.category) };
}
