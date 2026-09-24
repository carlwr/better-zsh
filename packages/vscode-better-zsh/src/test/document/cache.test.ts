import * as fcu from "@carlwr/fastcheck-utils"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import type * as vscode from "vscode"
import { docCache, evictDocCaches } from "../../document/cache"

const doc = (uri: string, version: number) =>
  ({ uri: { toString: () => uri }, version }) as {
    version: number
  } & vscode.TextDocument

describe("docCache", () => {
  test("computes on a document's first read, a version change, or after eviction — only then", () => {
    const step = fcu.record({
      uri: fcu.element(["a", "b"]),
      version: fc.nat({ max: 2 }),
      evict: fc.boolean(),
    })
    fc.assert(
      fc.property(fc.array(step, { maxLength: 20 }), steps => {
        let calls = 0
        const get = docCache(() => ++calls)
        const cached = new Map<string, number>()
        let want = 0
        for (const { uri, version, evict } of steps) {
          const d = doc(uri, version)
          if (evict) {
            evictDocCaches(d)
            cached.delete(uri)
          }
          if (cached.get(uri) !== version) want++
          cached.set(uri, version)
          get(d)
          expect(calls).toBe(want)
        }
      }),
    )
  })
})
