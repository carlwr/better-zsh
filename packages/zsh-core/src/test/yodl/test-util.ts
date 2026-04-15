import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { expect } from "vitest"

export function readVendoredYo(name: string): string {
  return readFileSync(resolve(__dirname, `../../data/zsh-docs/${name}`), "utf8")
}

export function only<T>(xs: readonly T[]): T {
  expect(xs).toHaveLength(1)
  const [x] = xs
  if (x === undefined) throw new Error("expected one item")
  return x
}

export function by<T, K extends PropertyKey>(
  xs: readonly T[],
  keyOf: (x: T) => K,
) {
  return new Map(xs.map(x => [keyOf(x), x]))
}

export function expectDocCorpus<T>({
  docs,
  minCount,
  keyOf,
  descOf,
  known = [],
  sectionOf,
}: {
  docs: readonly T[]
  minCount: number
  keyOf: (doc: T) => string
  descOf: (doc: T) => string
  known?: readonly string[]
  sectionOf?: (doc: T) => string
}) {
  expect(docs.length).toBeGreaterThanOrEqual(minCount)

  const keys = docs.map(keyOf)
  expect(new Set(keys).size).toBe(keys.length)

  for (const doc of docs) {
    expect(keyOf(doc)).toBeTruthy()
    expect(descOf(doc)).toBeTruthy()
    expect(descOf(doc)).not.toMatch(/\b(?:tt|var|item|xitem|sitem)\(/)
    if (sectionOf) expect(sectionOf(doc).trim()).toBeTruthy()
  }

  for (const key of known) expect(keys).toContain(key)
}
