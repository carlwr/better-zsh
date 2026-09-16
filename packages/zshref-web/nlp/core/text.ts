// String primitives every tier shares.

/**
 * The order of every sort (the ranker's tie-break, the lookup map, the
 * contract, report rows): UTF-16 code units, which is UTF-8 byte order for
 * ASCII — and everything ordered (ids, displays, category names, forms built
 * from them) is ASCII, pinned by zsh-core's corpus test. Not
 * `localeCompare`, which is locale-dependent.
 */
export const byteOrder = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0

/** ASCII lowercasing: what the retrieval text and the rule terms share. */
export const asciiLower = (s: string): string =>
  s.replace(/[A-Z]+/g, m => m.toLowerCase())
