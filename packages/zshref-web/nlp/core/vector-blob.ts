// The vector half of the search artifact: the float matrix as bytes.
//
// Why not JSON, where the whole artifact used to live: a text container
// costs decimal printing on the way out and, on the way in, `JSON.parse`
// plus a per-element schema walk over ~1.5M numbers — ~150ms of main
// thread and a transient copy several times the payload. Here the parse is
// a header read, a length check and one typed-array view. f32 and not
// something narrower: f16 halves the bytes but was measured to reorder
// results — `dtype` makes revisiting that a version bump, not a rewrite.
//
// Little-endian throughout, fixed header, then the matrix in the order
// `buildIndex` produces it: record-major, `VIEWS` order within.

import { perView, VIEWS, type View } from "./types"

/** "ZVEC" in file order; a byte-swapped read sees another number and throws. */
const MAGIC = 0x4345565a
const FORMAT_VERSION = 1
const DTYPE_F32 = 0

/** The header: these u32s in this order, then the UTF-8 `corpusHash`, then
 * the matrix. Both sides address a slot by name — a positional list would
 * drift the moment one grew. */
const HEADER = [
  "magic",
  "formatVersion",
  "dtype",
  "records",
  "dims",
  "views",
  "hashLen",
] as const
type HeaderField = (typeof HEADER)[number]
const HEADER_BYTES = HEADER.length * 4
const slotOf = (f: HeaderField): number => HEADER.indexOf(f) * 4

const utf8 = new TextEncoder()
const fromUtf8 = new TextDecoder("utf-8", { fatal: true })

const bad = (why: string): Error => new Error(`vector blob: ${why}`)

/** The hash bytes as text; invalid UTF-8 means the header is not what it says. */
function decodeHash(buffer: ArrayBuffer, len: number): string {
  try {
    return fromUtf8.decode(new Uint8Array(buffer, HEADER_BYTES, len))
  } catch {
    throw bad("corpus hash is not valid UTF-8")
  }
}

export interface VectorBlob {
  dims: number
  /** Ties the blob to its JSON half; any string (fixture builds stamp a tag). */
  corpusHash: string
  /** Record-major; each record's views keyed by `VIEWS`. */
  vectors: readonly Record<View, Float32Array<ArrayBuffer>>[]
}

/** Up to the next 4-byte boundary, so the matrix stays f32-aligned. */
const padded = (n: number): number => n + ((4 - (n % 4)) % 4)

/** Where the matrix starts, how many components it holds, and the whole
 * file's size — the layout both directions must agree on, so it is spelled
 * once. A one-sided edit here is a blob that encodes and will not decode. */
const layout = (
  hashLen: number,
  records: number,
  views: number,
  dims: number,
): { at: number; count: number; bytes: number } => {
  const at = HEADER_BYTES + padded(hashLen)
  const count = records * views * dims
  return { at, count, bytes: at + count * 4 }
}

export function encodeVectorBlob(blob: VectorBlob): ArrayBuffer {
  const { dims, corpusHash, vectors } = blob
  const hash = utf8.encode(corpusHash)
  const { at, count, bytes } = layout(
    hash.length,
    vectors.length,
    VIEWS.length,
    dims,
  )
  const buffer = new ArrayBuffer(bytes)
  const head = new DataView(buffer)
  const header: Record<HeaderField, number> = {
    magic: MAGIC,
    formatVersion: FORMAT_VERSION,
    dtype: DTYPE_F32,
    records: vectors.length,
    dims,
    views: VIEWS.length,
    hashLen: hash.length,
  }
  for (const f of HEADER) head.setUint32(slotOf(f), header[f], true)
  new Uint8Array(buffer).set(hash, HEADER_BYTES)
  const data = new Float32Array(buffer, at, count)
  let slot = 0
  for (const rec of vectors) {
    for (const view of VIEWS) {
      const v = rec[view]
      if (v.length !== dims)
        throw bad(`a ${view} vector is ${v.length}-dim, expected ${dims}`)
      data.set(v, slot)
      slot += dims
    }
  }
  return buffer
}

/** Every rejection names what disagreed; `buffer` must start at its header. */
export function decodeVectorBlob(buffer: ArrayBuffer): VectorBlob {
  if (buffer.byteLength < HEADER_BYTES)
    throw bad(`${buffer.byteLength} bytes, shorter than its header`)
  const head = new DataView(buffer)
  const u32 = (f: HeaderField): number => head.getUint32(slotOf(f), true)
  const magic = u32("magic")
  if (magic !== MAGIC)
    throw bad(`magic 0x${magic.toString(16)}, expected 0x${MAGIC.toString(16)}`)
  if (u32("formatVersion") !== FORMAT_VERSION)
    throw bad(
      `format version ${u32("formatVersion")}, expected ${FORMAT_VERSION}`,
    )
  if (u32("dtype") !== DTYPE_F32)
    throw bad(`dtype ${u32("dtype")}, expected f32 (${DTYPE_F32})`)
  const records = u32("records")
  const dims = u32("dims")
  const views = u32("views")
  const hashLen = u32("hashLen")
  if (views !== VIEWS.length)
    throw bad(`${views} views per record, expected ${VIEWS.length}`)
  if (padded(hashLen) > buffer.byteLength - HEADER_BYTES)
    throw bad(`corpus hash claims ${hashLen} bytes, past the end of the blob`)
  const { at, count, bytes } = layout(hashLen, records, views, dims)
  if (buffer.byteLength !== bytes) {
    const over = buffer.byteLength - bytes
    throw bad(
      `${buffer.byteLength} bytes, expected ${bytes} for ${records}x${views}x${dims}` +
        (over > 0 ? ` (${over} trailing)` : " (truncated)"),
    )
  }

  const data = new Float32Array(buffer, at, count)
  // JSON numbers are finite by grammar; bytes are not, so one pass buys the
  // guarantee back. Indexed, not `findIndex`: over a matrix this size the
  // per-element callback costs five times the loop.
  for (let i = 0; i < count; i++) {
    if (!Number.isFinite(data[i])) throw bad(`component ${i} is ${data[i]}`)
  }

  // Views over the one buffer, not copies. Safe because nothing mutates a
  // loaded vector — `normalizeF32` runs on fresh embedder output only.
  return {
    dims,
    corpusHash: decodeHash(buffer, hashLen),
    vectors: Array.from({ length: records }, (_, rec) =>
      perView((_, at) => {
        const from = (rec * views + at) * dims
        return data.subarray(from, from + dims)
      }),
    ),
  }
}
