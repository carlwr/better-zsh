// The file reads and writes every Node-side module shares.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { rm_rf } from "@carlwr/typescript-extra/node"
import { parse as parseYaml } from "yaml"

export const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8"))

export const readYaml = async (path: string): Promise<unknown> =>
  parseYaml(await readFile(path, "utf8"))

export const prettyJson = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`

/** `writeFile`, the parent directories created first. */
export async function writeFileDeep(
  path: string,
  data: string | Uint8Array,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, data)
}

/** `writeFileDeep` through a temp name, so a reader never meets a partial
 * file and an interrupted write leaves the previous one intact. */
export async function writeFileAtomic(
  path: string,
  data: string | Uint8Array,
): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`
  try {
    await writeFileDeep(tmp, data)
    await rename(tmp, path)
  } catch (e) {
    await rm_rf(tmp)
    throw e
  }
}

/**
 * A file as a standalone `ArrayBuffer`. `readFile` hands back a `Buffer`
 * over a shared pool at an arbitrary offset, which no `Float32Array` view
 * can sit on; the copy is what makes the bytes viewable.
 */
export async function readBytes(path: string): Promise<ArrayBuffer> {
  const buf = await readFile(path)
  const out = new ArrayBuffer(buf.byteLength)
  new Uint8Array(out).set(buf)
  return out
}
