import * as fcu from "@carlwr/fastcheck-utils"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  allTicked,
  categorySummary,
  coldMessage,
  DEFAULT_LIMIT,
  effectiveLimit,
  findRecord,
  parseSavedSearch,
  plainClick,
  type RecordView,
  type RecordViewInputs,
  recordHref,
  recordParam,
  recordView,
  restoreSearch,
  type SearchResult,
  saveSearch,
  searchIsBehind,
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

  it("an artifacts error outranks all, a cold search any search error; results or empty only after a settled search", () => {
    const anyInputs: fc.Arbitrary<ViewInputs> = fcu.record({
      artifactsErr: fcu.element(["", "boom"]),
      hasArtifacts: fc.boolean(),
      searching: fc.boolean(),
      embedderReady: fc.boolean(),
      searchErr: fcu.element(["", "nope"]),
      firstRun: fc.boolean(),
      matchCount: fc.nat({ max: 3 }),
    })
    // Half the inputs settled: drawn independently, a settled search is rare.
    const inputs = fc.oneof(
      anyInputs,
      anyInputs.map(s => ({
        ...s,
        artifactsErr: "",
        hasArtifacts: true,
        searching: false,
        searchErr: "",
        firstRun: false,
      })),
    )
    const cov = fcu.coverage({ settled: 25 })
    fc.assert(
      fc.property(inputs, s => {
        const { kind } = viewState(s)
        if (kind === "results" || kind === "empty") cov.hit("settled")
        if (s.artifactsErr) expect(kind).toBe("artifacts-error")
        else if (s.hasArtifacts && s.searching && !s.embedderReady)
          expect(kind).toBe("searching-cold")
        if (kind === "results" || kind === "empty")
          expect(s).toMatchObject({
            artifactsErr: "",
            hasArtifacts: true,
            searching: false,
            searchErr: "",
            firstRun: false,
          })
      }),
      { plugins: [cov.plugin] },
    )
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
    expect(recordHref(rec)).toBe("?r=builtin/typeset")
  })

  // Ids are zsh syntax: unencoded, `#` would start a fragment, `%pa` be a
  // malformed escape, `+` read as a space, `&` start another parameter.
  it.each([
    ["?", "?r=special_param/%3F"],
    ["#", "?r=special_param/%23"],
    ["${name%pattern}", "?r=special_param/%24%7Bname%25pattern%7D"],
    ["/", "?r=special_param/%2F"],
    [">> word", "?r=special_param/%3E%3E%20word"],
    ["+", "?r=special_param/%2B"],
    ["&", "?r=special_param/%26"],
  ])("href encodes the id %j", (id, href) => {
    expect(recordHref({ category: "special_param", id })).toBe(href)
  })

  // The href is relative: from any page, under any base path, it stays on
  // that page and links back to exactly its record.
  it("href round-trips through recordParam and keeps the page", () => {
    const bases = [
      "https://h/",
      "https://h/repo/",
      "https://h/repo/?r=a/b",
    ] as const
    fc.assert(
      fc.property(
        fcu.record({
          category: fc.stringMatching(/^[a-z_]+$/),
          // any text, URL-significant characters favoured
          id: fc.string({
            unit: fc.oneof(
              fc.constantFrom(..."/?#%+&= "),
              fc.string({ unit: "grapheme", minLength: 1, maxLength: 1 }),
            ),
          }),
        }),
        fcu.element(bases),
        (want, base) => {
          const url = new URL(recordHref(want), base)
          expect(recordParam(url)).toEqual(want)
          expect(url.pathname).toBe(new URL(base).pathname)
        },
      ),
    )
  })

  it.each<[string, ReturnType<typeof recordParam>]>([
    ["https://h/", null],
    ["https://h/repo/?x=1", null],
    ["https://h/?r=", { category: "", id: "" }],
    ["https://h/?r=foo", { category: "foo", id: "" }],
    [
      "https://h/?r=special_param/a/b",
      { category: "special_param", id: "a/b" },
    ],
  ])("recordParam(%s) → %j", (url, want) => {
    expect(recordParam(new URL(url))).toEqual(want)
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

  it("not-found names the record", () => {
    expect(
      recordView({
        ...FOUND,
        found: undefined,
        want: { category: "param", id: "PATH" },
      }),
    ).toEqual({
      kind: "not-found",
      message: 'no record "PATH" in category "param"',
    })
  })

  it("a malformed link lands in not-found", () => {
    const want = recordParam(new URL("https://h/?r=builtin"))
    expect(want).not.toBeNull()
    if (!want) return
    const v = recordView({ ...FOUND, found: findRecord([record], want), want })
    expect(v.kind).toBe("not-found")
  })

  it("record branch resolves the label", () => {
    expect(recordView(FOUND)).toMatchObject({
      kind: "record",
      label: "Builtins",
      record,
    })
  })
})

describe("saved search", () => {
  const echo = makeRecordText({ category: "builtin", id: "echo" })
  // same id, another category: the key must carry both
  const echoParam = makeRecordText({ category: "param", id: "echo" })
  const recs = [
    echo,
    echoParam,
    makeRecordText({ category: "param", id: "a/b?" }),
  ]
  const categories = [
    { id: "builtin", label: "Builtins" },
    { id: "param", label: "Parameters" },
  ]
  const corpus = { records: recs, categories }

  const resultArb: fc.Arbitrary<SearchResult> = fcu.record({
    query: fc.string(),
    cats: fc.subarray(categories.map(c => c.id)),
    limit: fc.option(fc.integer(), { nil: null }),
    total: fc.nat(),
    matches: fc
      .subarray(recs)
      .chain(rs =>
        fc.tuple(
          ...rs.map(rec =>
            fc
              .integer({ min: -1000, max: 1000 })
              .map(n => ({ rec, score: n / 1000 })),
          ),
        ),
      ),
  })

  it("round-trips through JSON against the same artifacts", () => {
    fc.assert(
      fc.property(resultArb, fc.nat(), (r, y) => {
        const s = parseSavedSearch(JSON.parse(JSON.stringify(saveSearch(r, y))))
        expect(s?.scrollY).toBe(y)
        if (!s) return
        const back = restoreSearch(s, corpus)
        expect(back).toEqual(r)
        // the very records, not copies: the index stays the one source
        for (const [i, m] of back.matches.entries())
          expect(m.rec).toBe(r.matches[i]?.rec)
      }),
    )
  })

  it("saves hits as keys, no record text", () => {
    const r = {
      query: "q",
      cats: [],
      limit: 5,
      total: 3,
      matches: [{ rec: echo, score: 0.5 }],
    }
    expect(saveSearch(r, 0).hits).toEqual([
      { category: "builtin", id: "echo", score: 0.5 },
    ])
  })

  it("drops what the artifacts no longer hold", () => {
    const s = saveSearch(
      {
        query: "q",
        cats: ["builtin", "gone"],
        limit: null,
        total: 9,
        matches: [
          { rec: makeRecordText({ category: "gone", id: "x" }), score: 1 },
          { rec: echoParam, score: 0.5 },
        ],
      },
      0,
    )
    const r = restoreSearch(s, corpus)
    expect(r.cats).toEqual(["builtin"])
    expect(r.matches).toEqual([{ rec: echoParam, score: 0.5 }])
  })

  it.each([
    ["nothing", undefined],
    ["null", null],
    [
      "another version",
      {
        ...saveSearch(
          { query: "", cats: [], limit: null, total: 0, matches: [] },
          0,
        ),
        v: 2,
      },
    ],
    ["a missing field", { v: 1, query: "q" }],
  ])("rejects %s", (_, raw) => {
    expect(parseSavedSearch(raw)).toBeUndefined()
  })
})

describe("back link", () => {
  const search = { url: new URL("https://h/repo/?") }
  const record = { url: new URL("https://h/repo/?r=builtin/echo") }

  it.each<[string, Parameters<typeof searchIsBehind>[0], boolean]>([
    ["a link from the search", { from: search, type: "link" }, true],
    [
      "a one-step Forward from the search",
      { from: search, type: "popstate", delta: 1 },
      true,
    ],
    [
      "a Back onto the record",
      { from: search, type: "popstate", delta: -1 },
      false,
    ],
    ["a long jump", { from: search, type: "popstate", delta: 2 }, false],
    ["a deep link", { from: null, type: "enter" }, false],
    [
      "a client-rendered deep link",
      { from: { url: null }, type: "enter" },
      false,
    ],
    ["a record-to-record hop", { from: record, type: "link" }, false],
  ])("traverses after %s: %s", (_, nav, want) => {
    expect(searchIsBehind(nav)).toBe(want)
  })

  const click = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
  }
  it.each([
    [{}, true],
    [{ button: 1 }, false],
    [{ metaKey: true }, false],
    [{ ctrlKey: true }, false],
    [{ shiftKey: true }, false],
    [{ altKey: true }, false],
  ])("plainClick %j → %s", (patch, want) => {
    expect(plainClick({ ...click, ...patch })).toBe(want)
  })
})
