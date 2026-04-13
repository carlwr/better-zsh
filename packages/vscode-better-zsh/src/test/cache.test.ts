import * as assert from "node:assert"
import { asyncDocCache, docCache, evictDocCaches } from "../cache"

function doc(uri: string, version = 1) {
  return {
    uri: { toString: () => uri },
    version,
  } as import("vscode").TextDocument
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

suite("cache", () => {
  test("docCache evicts closed documents", () => {
    let calls = 0
    const get = docCache(() => ++calls)
    const a = doc("test://doc/a")

    assert.strictEqual(get(a), 1)
    assert.strictEqual(get(a), 1)

    evictDocCaches(a)

    assert.strictEqual(get(a), 2)
  })

  test("asyncDocCache does not repopulate after eviction", async () => {
    let calls = 0
    const first = deferred<readonly string[]>()
    const second = deferred<readonly string[]>()
    const waits = [first, second]
    const get = asyncDocCache(async () => {
      const wait = waits[calls]
      if (!wait) throw new Error("unexpected async compute")
      calls++
      return await wait.promise
    })
    const a = doc("test://doc/a")

    const p1 = get(a)
    evictDocCaches(a)
    first.resolve(["old"])
    assert.deepStrictEqual(await p1, ["old"])

    const p2 = get(a)
    second.resolve(["new"])
    assert.deepStrictEqual(await p2, ["new"])
    assert.strictEqual(calls, 2)
  })
})
