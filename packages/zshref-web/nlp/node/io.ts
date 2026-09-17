// The file reads and writes every Node-side module shares.

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { parse as parseYaml } from "yaml"

export const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(path, "utf8"))

export const readYaml = async (path: string): Promise<unknown> =>
  parseYaml(await readFile(path, "utf8"))

export const prettyJson = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`

/** `writeFile`, the parent directories created first. */
export async function writeFileDeep(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text)
}
