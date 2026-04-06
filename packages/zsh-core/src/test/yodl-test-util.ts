import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { expect } from "vitest"

export function readVendoredYo(name: string): string {
  return readFileSync(resolve(__dirname, `../data/zsh-docs/${name}`), "utf8")
}

export function expectDocCorpus<T>({
  docs,
  minCount,
  keyOf,
  descOf,
  known = [],
}: {
  docs: readonly T[]
  minCount: number
  keyOf: (doc: T) => string
  descOf: (doc: T) => string
  known?: readonly string[]
}) {
  expect(docs.length).toBeGreaterThanOrEqual(minCount)

  const keys = docs.map(keyOf)
  expect(new Set(keys).size).toBe(keys.length)

  for (const doc of docs) {
    expect(keyOf(doc)).toBeTruthy()
    expect(descOf(doc)).toBeTruthy()
    expect(descOf(doc)).not.toMatch(/\b(?:tt|var|item|xitem|sitem)\(/)
  }

  for (const key of known) expect(keys).toContain(key)
}
