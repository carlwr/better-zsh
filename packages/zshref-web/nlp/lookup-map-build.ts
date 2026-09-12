// Build side of the lookup map (`src/lib/ranker/lookup-map.ts` is the
// consumer): enumerate the canonical surface forms per category, let the
// resolver canonicalize each, keep the one-to-one mappings. Close-variant
// fuzziness (extra spaces, dashes, mixed case outside the enumerated forms)
// is deliberately not in the map; the ranker handles it.

import type { DocCorpus } from '@carlwr/zsh-core';
import {
  type DocCategory,
  type DocRecordMap,
  docCategories,
  docDisplay,
  idOf
} from '@carlwr/zsh-core/taxonomy';
import type { LookupEntry, LookupMap } from '../src/lib/ranker/lookup-map';
import type { ResolverHit } from '../src/lib/ranker/types';
import { byteOrder } from './byte-order';
import { resolverKey } from './resolver-key';

export const LOOKUP_MAP_VERSION = 1;

/** Which enumerated shape a surface form is; the contract reports it. Listed in its sort order. */
export const surfaceFormKinds = [
  'id',
  'display',
  'lower-display',
  'no-prefix-display',
  'no-prefix-id'
] as const;
export type SurfaceFormKind = (typeof surfaceFormKinds)[number];

export type SurfaceForm = { form: string; kind: SurfaceFormKind };

type SurfaceFormsFn = (id: string, display: string) => readonly SurfaceForm[];

const none: SurfaceFormsFn = () => [];
const idOnly: SurfaceFormsFn = (id) => [{ form: id, kind: 'id' }];

// Complete over `DocCategory` so a new category has to be placed: either
// identifier-like (its id is a canonical query) or `none`. Sig/template
// categories (redirections, expansion forms, the flag categories, operators,
// prompt escapes, job specs) get `none` on purpose — a bare family-selector
// token has several resolvable destinations, which is the ranker's job.
//
// The option resolver strips `_` and case and handles `NO_`/`no_` negation,
// so each option form canonicalizes to the same id. `toLowerCase()` is
// ASCII lowercasing here: `_display` is printable ASCII.
const surfaceForms: { readonly [K in DocCategory]: SurfaceFormsFn } = {
  option: (id, display) => [
    { form: id, kind: 'id' },
    { form: display, kind: 'display' },
    { form: display.toLowerCase(), kind: 'lower-display' },
    { form: `NO_${display}`, kind: 'no-prefix-display' },
    { form: `no_${id}`, kind: 'no-prefix-id' }
  ],
  conditional_op: none,
  builtin: idOnly,
  precmd_modifier: idOnly,
  special_param: idOnly,
  complex_command: idOnly,
  reserved_word: idOnly,
  redirection: none,
  process_subst: none,
  param_expn: none,
  subscript_flag: none,
  param_expn_flag: none,
  history_expn: none,
  glob_op: none,
  glob_flag: none,
  glob_qualifier: none,
  prompt_escape: none,
  zle_widget: idOnly,
  keymap: idOnly,
  job_spec: none,
  arith_op: none,
  mathfunc: idOnly,
  special_function: idOnly,
  comp_utility: idOnly
};

/** The non-empty canonical surface forms of one record. */
export function surfaceFormsFor<K extends DocCategory>(
  cat: K,
  rec: DocRecordMap[K]
): readonly SurfaceForm[] {
  return surfaceForms[cat](idOf(cat, rec) as string, docDisplay(cat, rec)).filter(
    (s) => s.form !== ''
  );
}

const compareEntries = (a: LookupEntry, b: LookupEntry): number =>
  byteOrder(a.raw, b.raw) || byteOrder(a.category, b.category) || byteOrder(a.id, b.id);

/**
 * Every enumerated surface form the resolver canonicalizes, sorted by (raw,
 * category, id). `resolverKey` is a function of the form alone, so a form
 * reached from several records lands on one destination — no collision
 * handling is needed, and a plain map suffices.
 */
export function buildLookupMap(corpus: DocCorpus): LookupMap {
  const byRaw = new Map<string, ResolverHit>();
  for (const cat of docCategories) {
    for (const rec of corpus[cat].values()) {
      for (const { form } of surfaceFormsFor(cat, rec)) {
        const hit = resolverKey(corpus, form);
        if (hit) byRaw.set(form, hit);
      }
    }
  }
  const entries = [...byRaw]
    .map(([raw, { category, id }]) => ({ raw, category, id }))
    .sort(compareEntries);
  return { version: LOOKUP_MAP_VERSION, entries };
}
