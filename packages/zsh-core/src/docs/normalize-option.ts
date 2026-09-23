// MIRRORED-IN: zshref-rs/src/resolver.rs

import type { OptFlagSign } from "./types.ts"

/**
 * Lowercase, strip all underscores, trim. Idempotent: trimming last keeps
 * `_ a` from surfacing an edge space.
 */
export function normalizeOptName(raw: string): string {
  return raw.replace(/_/g, "").toLowerCase().trim()
}

export const flipOptFlagSign = (sign: OptFlagSign): OptFlagSign =>
  sign === "-" ? "+" : "-"
