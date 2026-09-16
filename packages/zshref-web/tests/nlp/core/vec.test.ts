// The vector primitives every tier ranks with.

import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { dot, normalizeF32, syntheticVec } from "../../../nlp/core/vec"

const norm = (v: Float32Array): number => Math.sqrt(dot(v, v))

describe("normalizeF32", () => {
  it("makes a unit vector, in place", () => {
    const v = new Float32Array([3, 4])
    expect(normalizeF32(v)).toBe(v)
    expect([...v]).toEqual([Math.fround(0.6), Math.fround(0.8)])
  })

  it("leaves the zero vector alone", () => {
    expect([...normalizeF32(new Float32Array(3))]).toEqual([0, 0, 0])
  })

  // Components of moderate magnitude, tiny ones flushed to 0: a square must
  // neither overflow nor underflow f32, so a zero norm is the zero vector's.
  const arbVec = fc
    .float32Array({
      minLength: 1,
      maxLength: 8,
      noNaN: true,
      noDefaultInfinity: true,
      min: -1e10,
      max: 1e10,
    })
    .map(v => v.map(x => (Math.abs(x) < 1e-3 ? 0 : x)))

  it("yields unit length for a non-zero vector, keeps direction, and is idempotent up to an ulp", () => {
    fc.assert(
      fc.property(arbVec, v => {
        const before = Float32Array.from(v)
        const once = normalizeF32(Float32Array.from(v))
        if (norm(before) === 0) {
          expect([...once]).toEqual([...before])
          return
        }
        expect(Math.abs(norm(once) - 1)).toBeLessThanOrEqual(1e-6)
        // The same direction: each component scaled by one positive factor.
        const k = norm(before)
        for (const [i, x] of before.entries())
          expect(once[i]).toBeCloseTo(x / k, 4)
        const twice = normalizeF32(Float32Array.from(once))
        for (const [i, x] of once.entries()) expect(twice[i]).toBeCloseTo(x, 6)
      }),
    )
  })
})

describe("syntheticVec", () => {
  it("is deterministic and unit", () => {
    const v = syntheticVec(["option", "autocd", "body"])
    expect(v).toEqual(syntheticVec(["option", "autocd", "body"]))
    expect(Math.abs(norm(v) - 1)).toBeLessThanOrEqual(1e-6)
  })

  it("is keyed by identity; the part separator keeps (ab,c) off (a,bc)", () => {
    const v = syntheticVec(["option", "autocd", "body"])
    expect(syntheticVec(["option", "autocd", "expanded"])).not.toEqual(v)
    expect(syntheticVec(["ab", "c"])).not.toEqual(syntheticVec(["a", "bc"]))
  })
})
