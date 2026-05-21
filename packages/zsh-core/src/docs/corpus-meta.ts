/**
 * Corpus-wide aggregate metadata. Deliberately hand-coded (NOT derived
 * from `loadCorpus()`) so importing this module stays side-effect-free —
 * consumers that need the constant must not be forced to eager-load the
 * corpus. Extension startup time is the prime constraint; the same posture
 * keeps the value available to non-TS consumers (Rust CLI, etc.). Build-time
 * drift is caught by `pkg-info.test.ts`.
 */

/** Total number of records across every `DocCategory` in the bundled corpus. */
export const RECORDS_TOTAL = 1313
