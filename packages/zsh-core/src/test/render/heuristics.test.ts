import { describe, expect, test } from "vitest"
import { refDocs } from "../../../scripts/ref-dump.ts"
import { loadCorpus } from "../../docs/corpus.ts"
import { type DocRecordId, mkRecordId } from "../../docs/taxonomy.ts"
import { heuristics } from "./heuristics.ts"
import { knownOffenders } from "./known-offenders.ts"

describe("render heuristics", () => {
  const docs = refDocs(loadCorpus())

  test.each(heuristics)("$name — offenders match known list", h => {
    const actual = sortPids(
      docs
        .filter(d => h.detects(d.md).length > 0)
        .map(d => mkRecordId(d.kind, d.id)),
    )
    const expected = sortPids(knownOffenders[h.name] ?? [])
    expect(actual).toEqual(expected)
  })
})

const sortPids = (xs: readonly DocRecordId[]): readonly DocRecordId[] =>
  [...xs].sort((a, b) =>
    a.category === b.category
      ? a.id.localeCompare(b.id)
      : a.category.localeCompare(b.category),
  )
