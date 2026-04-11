import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export function withTmpDir<T>(prefix: string, run: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    return run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export async function withTmpDirAsync<T>(
  prefix: string,
  run: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    return await run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
