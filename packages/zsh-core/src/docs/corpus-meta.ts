/**
 * Hand-coded (not derived from `loadCorpus()`) so importing stays
 * side-effect-free — consumers must not be forced to eager-load the corpus.
 * Extension startup is the prime constraint; also keeps the value available
 * to non-TS consumers (Rust CLI). Drift is caught by a build-time test.
 */

/** Total records across every `DocCategory` in the bundled corpus. */
export const RECORDS_TOTAL = 1312
