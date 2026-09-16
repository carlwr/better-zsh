// JSON printing for f32 data (index and fixture vectors): each component
// the shortest decimal that reads back to the same f32 — `JSON.stringify`
// prints a number as a double, and an f32 read back from JSON is exact in
// f64, so it would print its full expansion (`0.10000000149011612` for the
// f32 nearest 0.1), several times the bytes. The compact index form, then
// the pretty fixture form.

/**
 * Shortest decimal `s` with `Math.fround(Number(s)) === v`, as `toPrecision`
 * renders it (an exponent below 1e-6: `1.5e-7`). `v` must be a finite f32
 * value (`Math.fround(v) === v`) — a double that is not one has no such `s`.
 * `-0` prints as `0`: the sign is not observable by `===`, which is what
 * every reader compares with.
 */
export function f32Shortest(v: number): string {
  if (!Number.isFinite(v) || Math.fround(v) !== v) {
    throw new Error(`f32Shortest: ${v} is not a finite f32 value`)
  }
  for (let p = 1; p <= 9; p++) {
    const s = v.toPrecision(p)
    if (Math.fround(Number(s)) === v) return s
  }
  throw new Error(`f32Shortest: no 9-digit decimal round-trips ${v}`)
}

/** A vector as a JSON array text of `f32Shortest` components. */
export const f32VecJson = (v: Float32Array): string =>
  `[${Array.from(v, f32Shortest).join(",")}]`

/**
 * The object `head` as JSON with one more field spliced in last: `key`
 * holding `rawJson`, a JSON text printed by hand (the f32 vectors above,
 * which `JSON.stringify` would print as doubles). `head` must be non-empty.
 */
export const jsonWithRawField = (
  head: Record<string, unknown>,
  key: string,
  rawJson: string,
): string =>
  `${JSON.stringify(head).slice(0, -1)},${JSON.stringify(key)}:${rawJson}}`

/**
 * A fixture as committed: pretty (2-space, as `JSON.stringify` lays it out),
 * a `Float32Array` as a plain array of the shortest decimal per f32
 * component, any other number as `JSON.stringify` prints it (a non-finite
 * one is a generator bug and throws), `undefined` fields omitted, trailing
 * newline.
 */
export function fixtureJson(value: unknown): string {
  return `${pretty(value, "")}\n`
}

function pretty(v: unknown, indent: string): string {
  if (typeof v === "number") {
    if (!Number.isFinite(v))
      throw new Error(`fixtureJson: ${v} is not a finite number`)
    return JSON.stringify(v)
  }
  if (typeof v === "string" || typeof v === "boolean" || v === null)
    return JSON.stringify(v)
  const inner = `${indent}  `
  const block = (open: string, items: string[], close: string): string =>
    items.length === 0
      ? open + close
      : `${open}\n${items.map(x => inner + x).join(",\n")}\n${indent}${close}`
  if (v instanceof Float32Array)
    return block("[", Array.from(v, f32Shortest), "]")
  if (Array.isArray(v))
    return block(
      "[",
      v.map(x => pretty(x, inner)),
      "]",
    )
  if (typeof v === "object") {
    const fields = Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => `${JSON.stringify(k)}: ${pretty(x, inner)}`)
    return block("{", fields, "}")
  }
  throw new Error(`fixtureJson: cannot serialize a ${typeof v}`)
}
