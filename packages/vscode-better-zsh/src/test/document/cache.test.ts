import { describe, expect, test } from "vitest"
import type * as vscode from "vscode"
import { docCache, evictDocCaches } from "../../document/cache"

const doc = (uri: string, version = 1) =>
  ({ uri: { toString: () => uri }, version }) as {
    version: number
  } & vscode.TextDocument

describe("docCache", () => {
  test("recomputes on version change and after eviction", () => {
    let calls = 0
    const get = docCache(() => ++calls)
    expect([get(doc("a")), get(doc("a")), get(doc("a", 2))]).toEqual([1, 1, 2])
    evictDocCaches(doc("a"))
    expect(get(doc("a", 2))).toBe(3)
  })
})
