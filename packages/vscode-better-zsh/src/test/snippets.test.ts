import * as assert from "node:assert"
import { readSnippets } from "../build/snippets"

suite("snippets", () => {
  const snippets = readSnippets()

  // `prefix` is non-empty per the zod schema (`z.string().min(1)`) — covered at
  // type level. Uniqueness is the meaningful drift guard: duplicate prefixes
  // silently shadow in VS Code's Insert-Snippet QuickPick.
  test("prefixes are unique", () => {
    const seen = new Map<string, string>()
    for (const s of snippets) {
      const prior = seen.get(s.prefix)
      assert.strictEqual(
        prior,
        undefined,
        `duplicate prefix "${s.prefix}" on snippets "${prior}" and "${s.name}"`,
      )
      seen.set(s.prefix, s.name)
    }
  })

  test("names are unique", () => {
    const seen = new Set<string>()
    for (const s of snippets) {
      assert.ok(!seen.has(s.name), `duplicate snippet name "${s.name}"`)
      seen.add(s.name)
    }
  })
})
