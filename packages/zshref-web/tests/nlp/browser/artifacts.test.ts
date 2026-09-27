// Exercises the two loaders through a file-backed fetch: what each asks for,
// how they share, and that the full one lands a usable index.

import { describe, expect, it } from "vitest"
import {
  loadArtifacts,
  loadTextArtifacts,
} from "../../../nlp/browser/artifacts"
import {
  ARTIFACT,
  ARTIFACTS_DIR,
  ruleArtifact,
} from "../../../nlp/core/artifact-files"
import { RULE_FILES } from "../../../nlp/core/rules"
import { DIMS } from "../../../nlp/core/types"
import { readBytes } from "../../../nlp/node/io"
import { artifactGate, PATHS, readData, STAGED } from "../../_helpers"

// Per loader: the text-only one must stay runnable when only the text half
// is staged — that is the state its claim is about.
const bothGate = artifactGate("artifact loader", [...STAGED.index])
const textGate = artifactGate("artifact loader, text half", [
  ...STAGED.indexText,
])

// Rule URLs resolve to YAML sources; `readData` handles the format switch.
const url = (file: string) => `/${ARTIFACTS_DIR}/${file}`
const URL_TO_PATH: Record<string, string> = {
  [url(ARTIFACT.searchIndex)]: PATHS.searchIndex.json,
  [url(ARTIFACT.searchVectors)]: PATHS.searchIndex.vectors,
  [url(ARTIFACT.categories)]: PATHS.categoriesJson,
  [url(ARTIFACT.lookupMap)]: PATHS.lookupMap,
  ...Object.fromEntries(RULE_FILES.map(f => [url(ruleArtifact(f)), PATHS[f]])),
}

/** A fetch over the staged files, recording what was asked for; only the
 * `Response` members the loaders reach (a miss throws before its body). */
function recordingFetch(): { fetch: typeof fetch; asked: string[] } {
  const asked: string[] = []
  const fetcher = (async (url: RequestInfo | URL) => {
    asked.push(String(url))
    const path = URL_TO_PATH[String(url)]
    if (!path) return { ok: false, status: 404, statusText: "unmapped" }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => readData(path),
      arrayBuffer: async () => readBytes(path),
    }
  }) as unknown as typeof fetch
  return { fetch: fetcher, asked }
}

const timesAsked = (asked: readonly string[], file: string): number =>
  asked.filter(u => u === url(file)).length

describe("artifact loader", () => {
  it("loads every artifact and the taxonomy covers the index", async ctx => {
    if (bothGate) ctx.skip(bothGate)

    const { fetch } = recordingFetch()
    const { index, rules, categories } = await loadArtifacts({ fetch })

    expect(index.records.length).toBeGreaterThan(0)
    expect(index.dims).toBe(DIMS)
    expect(categories.length).toBeGreaterThan(0)
    expect(rules.tuning.boosts.category).toBeTypeOf("number")

    // Keep result chips from falling back to raw category ids.
    const labelled = new Set(categories.map(c => c.id))
    const inIndex = [...new Set(index.records.map(r => r.text.category))]
    expect(
      inIndex.filter(c => !labelled.has(c)),
      "index categories missing from categories.json",
    ).toEqual([])
  })

  // The record page's load.
  it("the text-only load fetches no vectors", async ctx => {
    if (textGate) ctx.skip(textGate)

    const { fetch, asked } = recordingFetch()
    const { index } = await loadTextArtifacts({ fetch })

    expect(index.records.length).toBeGreaterThan(0)
    expect(timesAsked(asked, ARTIFACT.searchVectors)).toBe(0)
    expect(timesAsked(asked, ARTIFACT.searchIndex)).toBe(1)
  })

  // A deep link, then a search: the text half must not travel twice.
  it("a full load reuses a text load handed to it", async ctx => {
    if (bothGate) ctx.skip(bothGate)

    const { fetch, asked } = recordingFetch()
    const text = loadTextArtifacts({ fetch })
    await text
    const { index } = await loadArtifacts({ fetch }, text)

    expect(index.records.length).toBeGreaterThan(0)
    expect(timesAsked(asked, ARTIFACT.searchIndex)).toBe(1)
    expect(timesAsked(asked, ARTIFACT.searchVectors)).toBe(1)
  })

  // Another model's vectors would rank as noise against the queries'.
  it("a full load rejects an index of another model revision", async ctx => {
    if (bothGate) ctx.skip(bothGate)

    const { fetch } = recordingFetch()
    const text = loadTextArtifacts({ fetch }).then(t => ({
      ...t,
      index: { ...t.index, model_revision: "other" },
    }))
    await expect(loadArtifacts({ fetch }, text)).rejects.toThrow(
      /model revision is other, expected/,
    )
  })

  // No gate: every URL misses, which is what proves the base was used.
  it("fetches from a base the caller gives it", async () => {
    const { fetch, asked } = recordingFetch()
    await expect(
      loadTextArtifacts({ fetch, base: "/sub/artifacts" }),
    ).rejects.toThrow(/\/sub\/artifacts\//)
    expect(asked.every(u => u.startsWith("/sub/artifacts/"))).toBe(true)
  })
})
