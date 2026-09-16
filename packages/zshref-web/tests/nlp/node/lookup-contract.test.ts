// The lookup-contract gate over the committed files: `lookup-contract.json`
// (entries) and `lookup-map.json`, read as the browser reads them — no
// corpus, no staging — so the shipped map is checked, not a rebuilt one
// (`contract.test.ts` beside this regenerates both from the corpus).
//
// Layer split:
// - **Bare** entries are tested here via lookup-map only — fast, and
//   unconditional: a missing committed input is a defect, not a skip.
// - **Decorated** entries are not re-tested here. They need the
//   full embed+rank pipeline; their coverage is the mechanical sentence
//   eval (`nlp/node/eval/mechanical.ts`; recorded, not a hard gate). Ranker
//   drift: `tests/nlp/core/parity.test.ts`; embedder integration:
//   `tests/nlp/browser/sanity.test.ts`.

import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { LookupMapSchema, lookupIndex } from "../../../nlp/core/lookup-map"
import { RecordIdSchema } from "../../../nlp/core/types"
import {
  evalBare,
  LOOKUP_CONTRACT_VERSION,
  phrasingKinds,
  predicates,
} from "../../../nlp/node/contract"
import { surfaceFormKinds } from "../../../nlp/node/lookup-map-build"
import { PATHS } from "../../_helpers"

const LookupContractSchema = z.object({
  version: z.literal(LOOKUP_CONTRACT_VERSION),
  entries: z.array(
    z.object({
      query: z.string(),
      record: RecordIdSchema,
      surfaceFormKind: z.enum(surfaceFormKinds),
      phrasingKind: z.enum(phrasingKinds),
      predicate: z.enum(predicates),
      expectedSet: z.array(RecordIdSchema),
    }),
  ),
})

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"))
}

describe("lookup contract (bare layer)", () => {
  it("every bare entry resolves via the lookup map", async () => {
    const [contractRaw, mapRaw] = await Promise.all([
      readJson(PATHS.lookupContract),
      readJson(PATHS.lookupMap),
    ])
    const contract = LookupContractSchema.parse(contractRaw)
    const idx = lookupIndex(LookupMapSchema.parse(mapRaw))
    const e = evalBare(contract, idx)
    console.log(
      `[contract bare] ${e.bareTotal} entries, ${e.failures.length} failures ` +
        `(skipped ${e.skippedDecorated} decorated — covered by the mechanical sentence eval)`,
    )
    expect(e.failures, e.failures.join("\n")).toEqual([])
  })
})
