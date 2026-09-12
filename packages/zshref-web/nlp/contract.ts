// The lookup contract: the auto-generated corpus of canonical-identifier
// queries the search system must satisfy, plus its bare-layer evaluation.
// `tests/lookup-contract.test.ts` consumes the committed JSON.
//
// One entry per (record, surface-form kind, phrasing kind), each with the
// query, an `expectedSet` derived from corpus iteration, and the predicate
// saying how the query must be satisfied. Two phrasing layers:
//
// - bare: the surface form alone (`AUTO_CD`, `setopt`) — resolves via the
//   lookup-map hard-promote bypass, no ranker needed
// - decorated: category label or id pre-/suffixed (`option AUTO_CD`,
//   `setopt builtin`) — needs embed + rank; generated here, consumed by the
//   mechanical eval
//
// Family-selector entries (sig/template categories) are deferred: `>`, `<<`,
// `${` … need a `top-K-equals-set` predicate, not `top1-in-set`.

import type { DocCorpus } from '@carlwr/zsh-core';
import {
  docCategories,
  docCategoryLabels,
  docDisplay,
  idOf
} from '@carlwr/zsh-core/taxonomy';
import type { LookupIndex } from '../src/lib/ranker/lookup-map';
import { byteOrder } from './byte-order';
import { type SurfaceFormKind, surfaceFormKinds, surfaceFormsFor } from './lookup-map-build';
import { resolverKey } from './resolver-key';

export const LOOKUP_CONTRACT_VERSION = 1;

/** Listed in sort order; bare first, then label-decorated, then id-decorated. */
export const phrasingKinds = [
  'bare',
  'label-prefix',
  'label-suffix',
  'id-prefix',
  'id-suffix'
] as const;
export type PhrasingKind = (typeof phrasingKinds)[number];

// A future `top-k-equals-set` is the family-selector extension.
export const predicates = ['top1-in-set'] as const;
export type Predicate = (typeof predicates)[number];

export type Identity = { category: string; id: string };

export type ContractEntry = {
  query: string;
  record: Identity;
  surfaceFormKind: SurfaceFormKind;
  phrasingKind: PhrasingKind;
  predicate: Predicate;
  expectedSet: readonly Identity[];
};

export type LookupContract = {
  version: typeof LOOKUP_CONTRACT_VERSION;
  entries: ContractEntry[];
};

/**
 * Build the contract: per record and surface form, the expected set is
 * derived from the bare form (decorated phrasings inherit it) and paired
 * with the `top1-in-set` predicate. Entries sort in field order (the
 * committed file's order); duplicate queries across records are kept.
 */
export function buildLookupContract(corpus: DocCorpus): LookupContract {
  const entries: ContractEntry[] = [];
  for (const cat of docCategories) {
    const label = docCategoryLabels[cat];
    for (const rec of corpus[cat].values()) {
      const record: Identity = { category: cat, id: idOf(cat, rec) as string };
      for (const { form, kind } of surfaceFormsFor(cat, rec)) {
        const expectedSet = expectedSetFor(corpus, form);
        if (expectedSet.length === 0) continue;
        for (const [query, phrasingKind] of dedupedPhrasings(form, cat, label)) {
          entries.push({
            query,
            record,
            surfaceFormKind: kind,
            phrasingKind,
            predicate: 'top1-in-set',
            expectedSet
          });
        }
      }
    }
  }
  return { version: LOOKUP_CONTRACT_VERSION, entries: entries.sort(compareEntries) };
}

/**
 * Phrasings per (record, surface form), bare → label-decorated →
 * id-decorated. Decorated forms collapse onto each other when the category
 * id equals its label (`option`, `builtin`); the first kind wins.
 */
function dedupedPhrasings(
  form: string,
  cat: string,
  label: string
): readonly (readonly [string, PhrasingKind])[] {
  const phrasings: readonly (readonly [string, PhrasingKind])[] = [
    [form, 'bare'],
    [`${label} ${form}`, 'label-prefix'],
    [`${form} ${label}`, 'label-suffix'],
    [`${cat} ${form}`, 'id-prefix'],
    [`${form} ${cat}`, 'id-suffix']
  ];
  const seen = new Set<string>();
  return phrasings.filter(([query]) => {
    if (seen.has(query)) return false;
    seen.add(query);
    return true;
  });
}

/**
 * Every record reachable as a canonical answer for `query`: the resolver's
 * verdict plus id/display equality in any category. Usually a single member;
 * `top1-in-set` accepts any member at slot 0.
 */
function expectedSetFor(corpus: DocCorpus, query: string): readonly Identity[] {
  const found: Identity[] = [];
  const hit = resolverKey(corpus, query);
  if (hit) found.push(hit);
  for (const cat of docCategories) {
    for (const rec of corpus[cat].values()) {
      const id = idOf(cat, rec) as string;
      if (id === query || docDisplay(cat, rec) === query) found.push({ category: cat, id });
    }
  }
  return dedupeSorted(found.sort(compareIdentity));
}

const dedupeSorted = (sorted: readonly Identity[]): readonly Identity[] =>
  sorted.filter((x, i) => {
    const prev = sorted[i - 1];
    return prev === undefined || compareIdentity(prev, x) !== 0;
  });

const compareIdentity = (a: Identity, b: Identity): number =>
  byteOrder(a.category, b.category) || byteOrder(a.id, b.id);

/** Lexicographic: element-wise, then the shorter first. */
function compareIdentityLists(a: readonly Identity[], b: readonly Identity[]): number {
  for (const [i, x] of a.entries()) {
    const y = b[i];
    if (y === undefined) return 1;
    const c = compareIdentity(x, y);
    if (c !== 0) return c;
  }
  return a.length - b.length;
}

const variantOrder =
  <T extends string>(variants: readonly T[]) =>
  (a: T, b: T): number =>
    variants.indexOf(a) - variants.indexOf(b);
const compareSurfaceFormKind = variantOrder(surfaceFormKinds);
const comparePhrasingKind = variantOrder(phrasingKinds);
const comparePredicate = variantOrder(predicates);

const compareEntries = (a: ContractEntry, b: ContractEntry): number =>
  byteOrder(a.query, b.query) ||
  compareIdentity(a.record, b.record) ||
  compareSurfaceFormKind(a.surfaceFormKind, b.surfaceFormKind) ||
  comparePhrasingKind(a.phrasingKind, b.phrasingKind) ||
  comparePredicate(a.predicate, b.predicate) ||
  compareIdentityLists(a.expectedSet, b.expectedSet);

// --- Bare-layer evaluation ---------------------------------------------------

const predicateHolds: {
  readonly [P in Predicate]: (entry: ContractEntry, top: Identity) => boolean;
} = {
  'top1-in-set': (entry, top) => entry.expectedSet.some((e) => compareIdentity(e, top) === 0)
};

/** Bare layer: the lookup-map hard-promote subsumes the canonical-form path, so a hit there is the test. */
function barePredicateHolds(entry: ContractEntry, idx: LookupIndex): boolean {
  const top = idx.lookup(entry.query);
  return top !== null && predicateHolds[entry.predicate](entry, top);
}

const identityText = (i: Identity): string => `${i.category}/${i.id}`;
const formatFailure = (e: ContractEntry): string =>
  `  query=${JSON.stringify(e.query)} record=${identityText(e.record)} surface=${e.surfaceFormKind}` +
  ` phrasing=${e.phrasingKind} expected=[${e.expectedSet.map(identityText).join(', ')}]`;

export type BareEval = {
  bareTotal: number;
  failures: string[];
  skippedDecorated: number;
};

/**
 * Bare-layer contract evaluation: every bare entry must resolve via the
 * lookup map. Pure on corpus + resolver — no embedder or index. Shared by
 * the contract test and the tuning dashboard's fast tier.
 */
export function evalBare(contract: LookupContract, idx: LookupIndex): BareEval {
  const bare = contract.entries.filter((e) => e.phrasingKind === 'bare');
  return {
    bareTotal: bare.length,
    failures: bare.filter((e) => !barePredicateHolds(e, idx)).map(formatFailure),
    skippedDecorated: contract.entries.length - bare.length
  };
}
