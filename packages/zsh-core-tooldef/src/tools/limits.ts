import { RECORDS_TOTAL } from "@carlwr/zsh-core"

/** Default `limit` when callers omit it on `search` / `list`. */
export const DEFAULT_LIMIT = 20

/** Hard cap on `limit`; equals the bundled corpus' total record count. */
export const MAX_LIMIT = RECORDS_TOTAL

export function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return DEFAULT_LIMIT
  const n = Math.max(0, Math.floor(limit))
  return Math.min(n, MAX_LIMIT)
}
