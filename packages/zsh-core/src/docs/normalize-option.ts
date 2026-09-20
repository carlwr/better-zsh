// MIRRORED-IN: zshref-rs/src/resolver.rs

import type { OptFlagSign } from "./types.ts"

/** Lowercase, strip all underscores. Idempotent. */
export function normalizeOptName(raw: string): string {
  return raw.replace(/_/g, "").toLowerCase()
}

export const flipOptFlagSign = (sign: OptFlagSign): OptFlagSign =>
  sign === "-" ? "+" : "-"
