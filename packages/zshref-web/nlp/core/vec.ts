// f32 vector primitives, one home for every runtime: the ranker's dot, the
// unit normalization both embedders apply, and the synthetic stand-in for an
// embedding the fixtures and tests rank with.

import { DIMS } from "./types"

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  // Stops at the shorter; in practice both are DIMS-length, so the `?? 0`
  // fallbacks never trigger (i stays in range).
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += (a[i] ?? 0) * (b[i] ?? 0)
  return s
}

/**
 * Unit-normalize `v` in place: f32 sequential `sqrt(Σx²)`, divide only if
 * the norm is positive. Returns `v`.
 */
export function normalizeF32<B extends ArrayBufferLike>(
  v: Float32Array<B>,
): Float32Array<B> {
  let sum = 0
  for (const x of v) sum = Math.fround(sum + Math.fround(x * x))
  const norm = Math.fround(Math.sqrt(sum))
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) / norm
  return v
}

const MASK64 = (1n << 64n) - 1n
const utf8 = new TextEncoder()

/** FNV-1a over each part's UTF-8 bytes; a trailing 0xff separates the parts,
 * so ("ab", "c") and ("a", "bc") do not collide. */
function fnv1a(parts: readonly string[]): bigint {
  let h = 0xcbf29ce484222325n
  for (const p of parts) {
    for (const b of [...utf8.encode(p), 0xff]) {
      h ^= BigInt(b)
      h = (h * 0x100000001b3n) & MASK64
    }
  }
  return h
}

/**
 * Stand-in for an embedding: a fixed-seed stream keyed by the vector's
 * identity (splitmix64 seeded by `fnv1a(key) | 1`, u64 wrapping via 64-bit
 * masking), normalized like a real one. Parity asserts that the ranker's
 * arithmetic agrees with its own past, never that retrieval is good — so
 * the numbers need to be reproducible, not meaningful, and generating them
 * is what keeps the 127M model out of the contract.
 */
export function syntheticVec(
  key: readonly string[],
): Float32Array<ArrayBuffer> {
  let state = fnv1a(key) | 1n
  const v = new Float32Array(DIMS)
  for (let i = 0; i < DIMS; i++) {
    state = (state + 0x9e3779b97f4a7c15n) & MASK64
    let z = state
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64
    z ^= z >> 31n
    // Top 24 bits over 2^23: every step is exact in f32, so the spread over
    // [-1, 1) carries no rounding bias (the typed-array store is the f32 cast).
    v[i] = Number(z >> 40n) / 8388608 - 1
  }
  normalizeF32(v)
  return v
}
