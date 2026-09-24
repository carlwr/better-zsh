import fc from "fast-check"
import { describe, expect, it } from "vitest"

import {
  f32Shortest,
  f32VecJson,
  fixtureJson,
  jsonWithRawField,
} from "../../../nlp/node/json-f32"

describe("f32Shortest", () => {
  it("prints the obvious cases", () => {
    const cases: [number, string][] = [
      [0.5, "0.5"],
      [1, "1"],
      [-0, "0"],
      [Math.fround(0.1), "0.1"],
      [Math.fround(-0.023456), "-0.023456"],
      [Math.fround(1.5e-7), "1.5e-7"],
    ]
    for (const [v, s] of cases) expect(f32Shortest(v), String(v)).toBe(s)
  })

  it("rejects what JSON cannot carry or an f32 cannot hold", () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, 0.1, 1e40]) {
      expect(() => f32Shortest(v), String(v)).toThrow(/not a finite f32/)
    }
  })

  // Any finite f32 — subnormals, huge and tiny values included: the printed
  // form reads back to the same f32, carries at most 9 significant digits,
  // and is valid JSON.
  const arbF32 = fc.float({ noNaN: true, noDefaultInfinity: true })

  it("round-trips every finite f32 in at most 9 significant digits", () => {
    fc.assert(
      fc.property(arbF32, v => {
        const s = f32Shortest(v)
        // `===`: what every reader compares with; `-0` prints as `0`.
        expect(Math.fround(Number(s)) === v, s).toBe(true)
        expect(JSON.parse(s)).toBe(Number(s))
        expect(
          s
            .replace(/e[+-]\d+$/, "")
            .replace(/[-.]/g, "")
            .replace(/^0+/, "").length,
        ).toBeLessThanOrEqual(9)
      }),
      { numRuns: 2000 },
    )
  })

  it("f32VecJson is a JSON array of the components", () => {
    expect(f32VecJson(new Float32Array([0.5, -1, Math.fround(0.1)]))).toBe(
      "[0.5,-1,0.1]",
    )
    expect(f32VecJson(new Float32Array())).toBe("[]")
  })

  it("jsonWithRawField splices the raw field last", () => {
    expect(jsonWithRawField({ a: 1, b: "x" }, "v", "[0.1]")).toBe(
      '{"a":1,"b":"x","v":[0.1]}',
    )
  })

  it("jsonWithRawField reads back as the head plus the field, for any JSON", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), fc.jsonValue(), { minKeys: 1 }),
        fc.string(),
        fc.jsonValue(),
        (head, key, raw) => {
          const want = JSON.parse(JSON.stringify({ ...head, [key]: raw }))
          const got = jsonWithRawField(head, key, JSON.stringify(raw))
          expect(JSON.parse(got)).toEqual(want)
        },
      ),
    )
  })
})

describe("fixtureJson", () => {
  it("lays out any JSON value exactly as 2-space JSON.stringify, plus a newline", () => {
    fc.assert(
      fc.property(fc.jsonValue(), value => {
        expect(fixtureJson(value)).toBe(`${JSON.stringify(value, null, 2)}\n`)
      }),
    )
  })

  it("prints a vector as its f32 components, and omits an undefined field", () => {
    const arbVec = fc
      .float32Array({ maxLength: 4, noNaN: true, noDefaultInfinity: true })
      .map(v => v.map(x => (x === 0 ? 0 : x))) // `-0` prints as `0`
    fc.assert(
      fc.property(arbVec, v => {
        const got = JSON.parse(fixtureJson({ v, u: undefined })) as {
          v: number[]
        }
        expect(Object.keys(got)).toEqual(["v"])
        expect(got.v.map(Math.fround)).toEqual([...v])
      }),
    )
  })

  it("refuses a non-finite number and what JSON cannot carry", () => {
    expect(() => fixtureJson(Number.NaN)).toThrow(/not a finite number/)
    expect(() => fixtureJson({ f: () => 1 })).toThrow(/cannot serialize/)
  })
})
