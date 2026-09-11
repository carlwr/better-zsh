// WEB-MIRROR-OF: zshref-rs/src/nlp/lookup_map.rs
//
// Static lookup map: canonical surface form → (category, id). Shipped as
// JSON alongside index.json; consumed before the ranker as a hard-promote
// bypass for canonical-identifier queries (e.g. `AUTO_CD`, `_arguments`,
// `NO_AUTO_CD`, `fc`). Close-variant fuzziness stays in the ranker.

import { z } from 'zod';

export const LookupEntrySchema = z.object({
  raw: z.string(),
  category: z.string(),
  id: z.string()
});
export type LookupEntry = z.infer<typeof LookupEntrySchema>;

export const LookupMapSchema = z.object({
  version: z.literal(1),
  entries: z.array(LookupEntrySchema)
});
export type LookupMap = z.infer<typeof LookupMapSchema>;

/** O(1) lookup wrapper built once at load time. */
export class LookupIndex {
  private readonly byRaw: Map<string, { category: string; id: string }>;

  constructor(map: LookupMap) {
    this.byRaw = new Map();
    for (const e of map.entries) {
      this.byRaw.set(e.raw, { category: e.category, id: e.id });
    }
  }

  /** Resolve `query` to `(category, id)` if a canonical entry exists.
   * Tries verbatim, then a lowercase fallback so e.g. `SETOPT` finds the
   * lowercased builtin id. */
  lookup(query: string): { category: string; id: string } | null {
    const q = query.trim();
    if (q === '') return null;
    const hit = this.byRaw.get(q);
    if (hit) return hit;
    const lower = q.toLowerCase();
    if (lower !== q) {
      return this.byRaw.get(lower) ?? null;
    }
    return null;
  }
}
