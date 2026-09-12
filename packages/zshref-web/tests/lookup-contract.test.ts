// WEB-MIRROR-OF: zshref-rs/src/nlp/contract.rs
//
// Web mirror of the lookup-contract gate. Consumes `lookup-contract.json`
// (entries) and `lookup-map.json` — both committed, so this needs no staging
// — and asserts the same bare-layer predicate as the Rust side.
//
// Layer split:
// - **Bare** entries (~1700) are tested here via lookup-map only — fast, and
//   unconditional: a missing committed input is a defect, not a skip.
// - **Decorated** entries (~4600) are not re-tested here. They need the
//   full embed+rank pipeline; Rust-side coverage is the mechanical sentence
//   eval (recorded, not a hard gate).
//   TS↔Rust ranker drift is pinned by `tests/parity.test.ts` (byte-equal
//   scoring on the parity-fixture queries) and embedder integration is
//   exercised by `tests/sanity.test.ts` (decorated-style
//   "kshoptionprint option" queries through the full pipeline).

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { evalBare, LOOKUP_CONTRACT_VERSION, phrasingKinds, predicates } from '../nlp/contract';
import { surfaceFormKinds } from '../nlp/lookup-map-build';
import { LookupIndex, LookupMapSchema } from '../src/lib/ranker/lookup-map';
import { PATHS } from './_helpers';

const IdentitySchema = z.object({ category: z.string(), id: z.string() });

const LookupContractSchema = z.object({
  version: z.literal(LOOKUP_CONTRACT_VERSION),
  entries: z.array(
    z.object({
      query: z.string(),
      record: IdentitySchema,
      surfaceFormKind: z.enum(surfaceFormKinds),
      phrasingKind: z.enum(phrasingKinds),
      predicate: z.enum(predicates),
      expectedSet: z.array(IdentitySchema)
    })
  )
});

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

describe('lookup contract (bare layer)', () => {
  it('every bare entry resolves via the lookup map', async () => {
    const [contractRaw, mapRaw] = await Promise.all([
      readJson(PATHS.lookupContract),
      readJson(PATHS.lookupMap)
    ]);
    const contract = LookupContractSchema.parse(contractRaw);
    const idx = new LookupIndex(LookupMapSchema.parse(mapRaw));
    const e = evalBare(contract, idx);
    console.log(
      `[contract bare] ${e.bareTotal} entries, ${e.failures.length} failures ` +
        `(skipped ${e.skippedDecorated} decorated — covered Rust-side by the mechanical sentence eval)`
    );
    expect(e.failures, e.failures.join('\n')).toEqual([]);
  });
});
