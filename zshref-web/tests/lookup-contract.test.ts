// WEB-MIRROR-OF: zshref-rs/src/nlp/contract.rs
//
// Web mirror of the lookup-contract gate. Consumes `lookup-contract.json`
// (entries) and `lookup-map.json` from the staged artifacts and asserts the
// same bare-layer predicate as the Rust side.
//
// Layer split:
// - **Bare** entries (~1700) are tested here via lookup-map only — fast,
//   runs unconditionally when the JSONs exist.
// - **Decorated** entries (~4600) are not re-tested here. They need the
//   full embed+rank pipeline; Rust-side coverage is the mechanical sentence
//   eval (recorded, not a hard gate).
//   TS↔Rust ranker drift is pinned by `tests/parity.test.ts` (byte-equal
//   scoring on the parity-fixture queries) and embedder integration is
//   exercised by `tests/sanity.test.ts` (decorated-style
//   "kshoptionprint option" queries through the full pipeline).

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { PATHS } from './_helpers';
import { LookupIndex, LookupMapSchema } from '../src/lib/ranker/lookup-map';

const IdentitySchema = z.object({ category: z.string(), id: z.string() });

const SurfaceFormKindSchema = z.enum([
  'id',
  'display',
  'lower-display',
  'no-prefix-display',
  'no-prefix-id'
]);
const PhrasingKindSchema = z.enum([
  'bare',
  'label-prefix',
  'label-suffix',
  'id-prefix',
  'id-suffix'
]);
const PredicateSchema = z.enum(['top1-in-set']);

const ContractEntrySchema = z.object({
  query: z.string(),
  record: IdentitySchema,
  surfaceFormKind: SurfaceFormKindSchema,
  phrasingKind: PhrasingKindSchema,
  predicate: PredicateSchema,
  expectedSet: z.array(IdentitySchema)
});
type ContractEntry = z.infer<typeof ContractEntrySchema>;

const LookupContractSchema = z.object({
  version: z.literal(1),
  entries: z.array(ContractEntrySchema)
});

function gate(): string | null {
  const required = [PATHS.lookupContract, PATHS.lookupMap];
  const missing = required.filter((p) => !existsSync(p));
  if (missing.length === 0) return null;
  const msg = `lookup contract: missing ${missing.join(', ')}`;
  if (process.env.BZ_REQUIRE_LOOKUP_CONTRACT === '1') {
    throw new Error(`${msg} (BZ_REQUIRE_LOOKUP_CONTRACT=1)`);
  }
  return `skipped: ${msg}`;
}

const skipReason = gate();

function predicateHolds(entry: ContractEntry, idx: LookupIndex): boolean {
  const hit = idx.lookup(entry.query);
  if (!hit) return false;
  return entry.expectedSet.some((e) => e.category === hit.category && e.id === hit.id);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

describe('lookup contract (bare layer)', () => {
  it.skipIf(skipReason)('every bare entry resolves via the lookup map', async () => {
    const [contractRaw, mapRaw] = await Promise.all([
      readJson(PATHS.lookupContract),
      readJson(PATHS.lookupMap)
    ]);
    const contract = LookupContractSchema.parse(contractRaw);
    const idx = new LookupIndex(LookupMapSchema.parse(mapRaw));
    const failures: string[] = [];
    let bareTotal = 0;
    let decoratedSkipped = 0;
    for (const entry of contract.entries) {
      if (entry.phrasingKind !== 'bare') {
        decoratedSkipped++;
        continue;
      }
      bareTotal++;
      if (!predicateHolds(entry, idx)) {
        failures.push(
          `query=${JSON.stringify(entry.query)} record=${entry.record.category}/${entry.record.id} kind=${entry.surfaceFormKind}`
        );
      }
    }
    console.log(
      `[contract bare] ${bareTotal} entries, ${failures.length} failures ` +
        `(skipped ${decoratedSkipped} decorated — covered Rust-side by the mechanical sentence eval)`
    );
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
