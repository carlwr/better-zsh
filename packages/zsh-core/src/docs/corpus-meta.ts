/**
 * Corpus-wide aggregate metadata. Hand-exported here (single source of
 * truth for non-TS consumers); `pkg-info.test.ts` drift-guards against
 * the loaded `DocCorpus`.
 *
 * Surfaced on the public API so adapters can size response limits
 * against "full corpus" without summing per-category counts at startup.
 * The Rust CLI computes the same sum at startup against its baked-in
 * JSON; the value below must agree.
 */

/** Total number of records across every `DocCategory` in the bundled corpus. */
export const RECORDS_TOTAL = 1128
