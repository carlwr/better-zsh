// JSON number printing for f32 data (index vectors, fixture scores): the
// shortest decimal that reads back to the same f32. `JSON.stringify` prints
// a number as a double: an f32 read back from JSON is exact in f64, so it
// would print its full expansion (`0.10000000149011612` for the f32 nearest
// 0.1), several times the bytes.

/**
 * Shortest decimal `s` with `Math.fround(Number(s)) === v`, as `toPrecision`
 * renders it (an exponent below 1e-6: `1.5e-7`). `v` must be a finite f32
 * value (`Math.fround(v) === v`) — a double that is not one has no such `s`.
 * `-0` prints as `0`: the sign is not observable by `===`, which is what
 * every reader compares with.
 */
export function f32Shortest(v: number): string {
  if (!Number.isFinite(v) || Math.fround(v) !== v) {
    throw new Error(`f32Shortest: ${v} is not a finite f32 value`);
  }
  for (let p = 1; p <= 9; p++) {
    const s = v.toPrecision(p);
    if (Math.fround(Number(s)) === v) return s;
  }
  throw new Error(`f32Shortest: no 9-digit decimal round-trips ${v}`);
}

/** A vector as a JSON array text of `f32Shortest` components. */
export const f32VecJson = (v: Float32Array): string => `[${Array.from(v, f32Shortest).join(',')}]`;
