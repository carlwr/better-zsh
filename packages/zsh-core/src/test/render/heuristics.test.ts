import { describe, expect, test } from "vitest"
import { loadCorpus } from "../../docs/corpus.ts"
import { type DocPieceId, mkPieceId } from "../../docs/taxonomy.ts"
import { refDocs } from "../../render/refs.ts"
import { heuristics } from "./heuristics.ts"
import { knownOffenders } from "./known-offenders.ts"

describe("render heuristics", () => {
  const docs = refDocs(loadCorpus())

  test.each(heuristics)("$name — offenders match known list", h => {
    const actual = sortPids(
      docs
        .filter(d => h.detects(d.md).length > 0)
        .map(d => mkPieceId(d.kind, d.id)),
    )
    const expected = sortPids(knownOffenders[h.name] ?? [])
    expect(actual).toEqual(expected)
  })
})

const sortPids = (xs: readonly DocPieceId[]): readonly DocPieceId[] =>
  [...xs].sort((a, b) =>
    a.category === b.category
      ? a.id.localeCompare(b.id)
      : a.category.localeCompare(b.category),
  )
