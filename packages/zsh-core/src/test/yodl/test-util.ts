import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { allUnique } from "@carlwr/typescript-extra"
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

// Single source of truth for "no raw yodl leaked" assertions; each entry is a
// macro signature or sentinel that `stripYodl` / `normalizeBody` should have
// consumed in normalized output.
const YODL_LEAK_MARKERS: readonly string[] = [
  ..."tt var em bf item xitem sitem sxitem startitem enditem startsitem endsitem vindex findex cindex pindex tindex example manref noderef zmanref"
    .split(" ")
    .map(m => `${m}(`),
  "\u0007", // sitem internal sentinel
]

export function expectNoYodlLeaks(s: string): void {
  for (const m of YODL_LEAK_MARKERS) expect(s).not.toContain(m)
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
  /** Return `undefined` for records whose desc is legitimately absent. */
  descOf: (doc: T) => string | undefined
  known?: readonly string[]
  sectionOf?: (doc: T) => string
}) {
  expect(docs.length).toBeGreaterThanOrEqual(minCount)

  const keys = docs.map(keyOf)
  expect(allUnique(keys)).toBe(true)

  for (const doc of docs) {
    expect(keyOf(doc)).toBeTruthy()
    const desc = descOf(doc)
    if (desc !== undefined) {
      expect(desc).toBeTruthy()
      expectNoYodlLeaks(desc)
    }
    if (sectionOf) expect(sectionOf(doc).trim()).toBeTruthy()
  }

  for (const key of known) expect(keys).toContain(key)
}
