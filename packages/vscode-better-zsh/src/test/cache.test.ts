import { describe, expect, test } from "vitest"
import type * as vscode from "vscode"
import { asyncDocCache, docCache, evictDocCaches } from "../cache"

const doc = (uri: string, version = 1) =>
  ({ uri: { toString: () => uri }, version }) as {
    version: number
  } & vscode.TextDocument

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => {
    resolve = r
  })
  return { promise, resolve }
}

describe("docCache", () => {
  test("recomputes on version change and after eviction", () => {
    let calls = 0
    const get = docCache(() => ++calls)
    expect([get(doc("a")), get(doc("a")), get(doc("a", 2))]).toEqual([1, 1, 2])
    evictDocCaches(doc("a"))
    expect(get(doc("a", 2))).toBe(3)
  })
})

describe("asyncDocCache", () => {
  test("does not repopulate from a compute that started before eviction", async () => {
    const waits = [deferred<string>(), deferred<string>()]
    let calls = 0
    const get = asyncDocCache(async () => {
      const wait = waits[calls++]
      if (!wait) throw new Error("unexpected compute")
      return wait.promise
    })
    const a = doc("a")

    const p1 = get(a)
    evictDocCaches(a)
    waits[0]?.resolve("old")
    expect(await p1).toBe("old")

    const p2 = get(a)
    waits[1]?.resolve("new")
    expect(await p2).toBe("new")
    expect(calls).toBe(2)
  })

  test("caches under the version the computation started from, not the one it finished under", async () => {
    const wait = deferred<string>()
    let calls = 0
    const get = asyncDocCache(async () => {
      calls++
      return calls === 1 ? wait.promise : "fresh"
    })
    const live = doc("a")
    const p1 = get(live)
    live.version = 2 // edited while computing
    wait.resolve("stale")
    expect(await p1).toBe("stale")
    expect(await get(live)).toBe("fresh")
  })
})
