import { RECORDS_TOTAL } from "@carlwr/zsh-core"
import type { PropertySpec } from "../../tool-defs"

/** Default `limit` when callers omit it on `search` / `list`. */
export const DEFAULT_LIMIT = 20

/** Hard cap on `limit`; equals the bundled corpus' total record count. */
export const MAX_LIMIT = RECORDS_TOTAL

export function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return DEFAULT_LIMIT
  const n = Math.max(0, Math.floor(limit))
  return Math.min(n, MAX_LIMIT)
}

export const limitBrief = `max. matches to return (default: ${DEFAULT_LIMIT})`

export const limitOptionDescription = `Limit the number of matches to return.

Use 0 to return only metadata.

Default: ${DEFAULT_LIMIT}`

export const limitDescription = limitOptionDescription

export const inputSchemaLimit: PropertySpec = {
  type: "integer",
  minimum: 0,
  maximum: MAX_LIMIT,
  default: DEFAULT_LIMIT,
  description: limitOptionDescription,
}
