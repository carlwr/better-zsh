import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  allTicked,
  categorySummary,
  coldMessage,
  DEFAULT_LIMIT,
  effectiveLimit,
  findRecord,
  type RecordView,
  type RecordViewInputs,
  recordHref,
  recordView,
  summaryLine,
  type ViewInputs,
  type ViewState,
  viewState,
} from "../../src/lib/view"
import { makeRecordText } from "../_fixtures"

// Baseline: each case flips the minimal fields to claim its branch.
const RESULTS: ViewInputs = {
  artifactsErr: "",
  hasArtifacts: true,
  searching: false,
  embedderReady: true,
  searchErr: "",
  firstRun: false,
  matchCount: 3,
}

describe("viewState", () => {
  it.each<[ViewState["kind"], Partial<ViewInputs>]>([
    ["results", {}],
    ["artifacts-error", { artifactsErr: "boom" }],
    ["loading-artifacts", { hasArtifacts: false }],
    ["searching-cold", { searching: true, embedderReady: false }],
    ["searching", { searching: true }],
    ["search-error", { searchErr: "nope" }],
    ["prompt", { firstRun: true }],
    ["empty", { matchCount: 0 }],
  ])("claims %s", (kind, patch) => {
    expect(viewState({ ...RESULTS, ...patch }).kind).toBe(kind)
  })

  it("artifacts error outranks all", () => {
    const v = viewState({
      artifactsErr: "boom",
      hasArtifacts: false,
      searching: true,
      embedderReady: false,
      searchErr: "nope",
      firstRun: true,
      matchCount: 0,
    })
    expect(v.kind).toBe("artifacts-error")
  })

  it("cold search outranks stale error", () => {
    const v = viewState({
      ...RESULTS,
      searching: true,
      embedderReady: false,
      searchErr: "stale",
    })
    expect(v.kind).toBe("searching-cold")
  })

  it("error branches carry the message", () => {
    expect(viewState({ ...RESULTS, artifactsErr: "disk gone" })).toEqual({
      kind: "artifacts-error",
      message: "disk gone",
    })
    expect(viewState({ ...RESULTS, searchErr: "embed failed" })).toEqual({
      kind: "search-error",
      message: "embed failed",
    })
  })
})

describe("summaryLine", () => {
  it.each([
    [3, 10, "top 3 of 10 records"],
    [10, 10, "10 records"],
    [1, 1, "1 record"],
    [0, 0, "0 records"],
  ])('shown=%i total=%i → "%s"', (shown, total, expected) => {
    expect(summaryLine(shown, total)).toBe(expected)
  })
})

describe("effectiveLimit", () => {
  it.each([
    [null, DEFAULT_LIMIT],
    [0, DEFAULT_LIMIT],
    [-3, DEFAULT_LIMIT],
    [1, 1],
    [50, 50],
  ])("%j → %i", (input, want) => {
    expect(effectiveLimit(input)).toBe(want)
  })
})

describe("coldMessage", () => {
  it.each([
    [null, "preparing the embedding model…"],
    [{ loadedBytes: 0, totalBytes: 0 }, "preparing the embedding model…"],
    [
      { loadedBytes: 12_400_000, totalBytes: 133_000_000 },
      "loading the embedding model… 12 / 133 MB",
    ],
    [
      { loadedBytes: 133_000_000, totalBytes: 133_000_000 },
      "preparing the embedding model…",
    ],
  ])("%j → %s", (progress, want) => {
    expect(coldMessage(progress)).toBe(want)
  })
})

describe("category filter summary", () => {
  it.each([
    [0, 0, false, "none"],
    [0, 3, false, "none"],
    [2, 3, false, "2 selected"],
    [3, 3, true, "all"],
  ])("selected=%i of %i: allTicked=%s, %j", (selected, all, ticked, want) => {
    expect(allTicked(selected, all)).toBe(ticked)
    expect(categorySummary(selected, all)).toBe(want)
  })
})

describe("record links", () => {
  const rec = { category: "builtin", id: "typeset" }

  it("href is the permalink", () => {
    expect(recordHref(rec)).toBe("/r/builtin/typeset")
  })

  // Ids are zsh syntax: unencoded, `?` would start a query string, `#` a
  // fragment, `%pa` a malformed escape, `/` another segment.
  it.each([
    ["?", "/r/special_param/%3F"],
    ["#", "/r/special_param/%23"],
    ["${name%pattern}", "/r/special_param/%24%7Bname%25pattern%7D"],
    ["/", "/r/special_param/%2F"],
    [">> word", "/r/special_param/%3E%3E%20word"],
  ])("href encodes the id %j", (id, href) => {
    expect(recordHref({ category: "special_param", id })).toBe(href)
  })

  it("href is two decodable segments for any id", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), id => {
        const href = recordHref({ ...rec, id })
        const [, r, category, encoded, ...rest] = href.split("/")
        expect([r, category, rest]).toEqual(["r", "builtin", []])
        expect(decodeURIComponent(encoded ?? "")).toBe(id)
      }),
    )
  })
})

describe("findRecord", () => {
  // Two 'echo's in different categories — the collision the match resolves.
  const records = [
    { category: "builtin", id: "echo" },
    { category: "param", id: "PATH" },
    { category: "param", id: "echo" },
  ]

  it("matches category+id, not id alone", () => {
    expect(findRecord(records, { category: "param", id: "echo" })).toBe(
      records[2],
    )
  })

  it("undefined when no match", () => {
    expect(
      findRecord(records, { category: "builtin", id: "PATH" }),
    ).toBeUndefined()
  })
})

describe("recordView", () => {
  const record = makeRecordText({ category: "builtin", id: "echo" })
  const FOUND: RecordViewInputs = {
    loadError: "",
    ready: true,
    found: record,
    categories: [{ id: "builtin", label: "Builtins" }],
    want: { category: "builtin", id: "echo" },
  }

  it.each<[RecordView["kind"], Partial<RecordViewInputs>]>([
    ["record", {}],
    ["load-error", { loadError: "disk gone" }],
    ["loading", { ready: false, found: undefined }],
    ["not-found", { found: undefined }],
  ])("claims %s", (kind, patch) => {
    expect(recordView({ ...FOUND, ...patch }).kind).toBe(kind)
  })

  it("load error outranks all", () => {
    const v = recordView({
      ...FOUND,
      loadError: "boom",
      ready: false,
      found: undefined,
    })
    expect(v.kind).toBe("load-error")
  })

  it("not-found names the permalink", () => {
    expect(
      recordView({
        ...FOUND,
        found: undefined,
        want: { category: "param", id: "PATH" },
      }),
    ).toEqual({
      kind: "not-found",
      message: "no record at /r/param/PATH",
    })
  })

  it("record branch resolves the label", () => {
    expect(recordView(FOUND)).toMatchObject({
      kind: "record",
      label: "Builtins",
      record,
    })
  })
})
