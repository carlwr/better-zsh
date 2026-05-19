/** Escape RegExp metacharacters so `s` can be embedded as a literal in `new RegExp(...)`. */
export const escapeRegExp = (s: string): string =>
  s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
