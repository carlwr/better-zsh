// The string order every sorted output uses (lookup map, contract, report
// rows): UTF-16 code units, which is UTF-8 byte order for ASCII — and
// everything ordered (ids, displays, category names, forms built from them)
// is ASCII, pinned by zsh-core's corpus test. Not `localeCompare`, which is
// locale-dependent.

export const byteOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
