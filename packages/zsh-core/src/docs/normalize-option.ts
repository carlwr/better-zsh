// MIRRORED-IN: zshref-rs/src/resolver.rs

/** Lowercase, strip all underscores. Idempotent. */
export function normalizeOptName(raw: string): string {
  return raw.replace(/_/g, "").toLowerCase()
}
