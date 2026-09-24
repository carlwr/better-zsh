// The binary codec on its own: what it round-trips, and every way a blob is
// rejected. Runtime-agnostic — no corpus, no model, no files.

import * as fcu from "@carlwr/fastcheck-utils"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { perView } from "../../../nlp/core/types"
import {
  decodeVectorBlob,
  encodeVectorBlob,
  type VectorBlob,
} from "../../../nlp/core/vector-blob"
import { arbViewVectors } from "../../_arbs"

/** Any shape the encoder must accept: any dims, any record count, and a hash
 * of any length (fixture builds stamp a tag, not a hex digest — so every
 * padding residue occurs). */
const arbBlob: fc.Arbitrary<VectorBlob> = fc
  .integer({ min: 0, max: 5 })
  .chain(dims =>
    fcu.record({
      dims: fc.constant(dims),
      corpusHash: fc.string(),
      vectors: fc.array(arbViewVectors(dims), { maxLength: 4 }),
    }),
  )

const bytesOf = (blob: VectorBlob): Uint8Array =>
  new Uint8Array(encodeVectorBlob(blob))

/** Decode exactly these bytes, however they were spliced together. */
const decodeOf = (bytes: Uint8Array): VectorBlob => {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return decodeVectorBlob(buffer)
}

const tinyBlob: VectorBlob = {
  dims: 2,
  corpusHash: "ab".repeat(32),
  vectors: [perView((_, at) => new Float32Array([at, -0.5]))],
}

describe("encode / decode", () => {
  it("round-trips any blob", () => {
    fc.assert(
      fc.property(arbBlob, blob => {
        expect(decodeVectorBlob(encodeVectorBlob(blob))).toEqual(blob)
      }),
    )
  })

  // The format's whole claim: the parse is a header read and a view. `slice`
  // in place of `subarray` would double the resident vectors, silently.
  it("views the one buffer rather than copying", () => {
    const buffer = encodeVectorBlob(tinyBlob)
    expect(decodeVectorBlob(buffer).vectors[0]?.body.buffer).toBe(buffer)
  })

  // Signs survive because the components are copied, not printed: the
  // decimal form the JSON artifact used to carry could not hold `-0`.
  it("keeps -0 distinct from 0", () => {
    const blob: VectorBlob = {
      dims: 2,
      corpusHash: "",
      vectors: [perView(() => new Float32Array([-0, 0]))],
    }
    const back = decodeVectorBlob(encodeVectorBlob(blob)).vectors[0]
    expect(Object.is(back?.body[0], -0)).toBe(true)
    expect(Object.is(back?.body[1], 0)).toBe(true)
  })

  it("rejects a vector whose width is not the declared dims", () => {
    expect(() =>
      encodeVectorBlob({
        dims: 2,
        corpusHash: "",
        vectors: [perView(() => new Float32Array(3))],
      }),
    ).toThrow(/3-dim, expected 2/)
  })
})

// Each case mangles a good blob one way; each way names itself in the error.
describe("decode rejections", () => {
  const u32 = (at: number, v: number) => (bytes: Uint8Array) => {
    new DataView(bytes.buffer).setUint32(at * 4, v, true)
    return bytes
  }
  const grow = (by: number) => (bytes: Uint8Array) => {
    const out = new Uint8Array(bytes.length + by)
    out.set(bytes)
    return out
  }
  const f32 = (at: number, v: number) => (bytes: Uint8Array) => {
    new DataView(bytes.buffer).setFloat32(at, v, true)
    return bytes
  }

  it.each([
    ["too short for a header", (b: Uint8Array) => b.slice(0, 12), /shorter/],
    ["not a vector blob", u32(0, 0), /magic/],
    // What a big-endian reader would see: the same bytes, the other way up.
    [
      "byte-swapped",
      (b: Uint8Array) => {
        new DataView(b.buffer).setUint32(0, 0x4345565a, false)
        return b
      },
      /magic/,
    ],
    ["another format version", u32(1, 9), /format version 9/],
    ["another dtype", u32(2, 1), /dtype 1/],
    ["another view count", u32(5, 9), /9 views per record/],
    ["claiming an impossible hash length", u32(6, 0xffffffff), /corpus hash/],
    ["truncated", (b: Uint8Array) => b.slice(0, -4), /\(truncated\)/],
    ["carrying trailing bytes", grow(4), /\(4 trailing\)/],
    [
      "holding a non-finite component",
      (b: Uint8Array) => f32(b.length - 4, Number.POSITIVE_INFINITY)(b),
      /component \d+ is Infinity/,
    ],
  ])("rejects a blob %s", (_label, mangle, reason) => {
    expect(() => decodeOf(mangle(bytesOf(tinyBlob)))).toThrow(reason)
  })

  it("rejects every blob cut short or grown", () => {
    fc.assert(
      fc.property(
        arbBlob,
        fc.nat(),
        fc.integer({ min: 1, max: 8 }),
        (blob, cut, extra) => {
          const b = bytesOf(blob)
          expect(() => decodeOf(b.slice(0, cut % b.length))).toThrow()
          expect(() => decodeOf(grow(extra)(b))).toThrow()
        },
      ),
    )
  })
})
