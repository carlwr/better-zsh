/** Phantom-branded type for nominal-ish typing with zero runtime cost. */
export type Brand<T, B extends string> = T & { readonly __brand: B }

/** Normalized zsh option name: lowercase, no underscores */
export type OptName = Brand<string, "OptName">

/** Conditional expression operator: "-a", "-nt", "=~", etc. */
export type CondOp = Brand<string, "CondOp">

/** Single-letter option flag char: "J", "N", "0", etc. */
export type OptFlagChar = Brand<string, "OptFlagChar">

/** Exact builtin or command-like spelling */
export type BuiltinName = Brand<string, "BuiltinName">

function trim(raw: string): string {
  return raw.trim()
}

// idempotent; strips underscores, lowercases — `mkOptName` is safe to call on already-normalized input
function normalizeOptName(raw: string): string {
  return raw.replace(/_/g, "").toLowerCase()
}

/** Smart constructor: lowercases and strips underscores. */
export function mkOptName(raw: string): OptName {
  return normalizeOptName(raw) as OptName
}

// strips leading `no`/`no_` prefix so negated options resolve to their base canonical name
/** Smart constructor for option tokens that may use zsh's `no_` negation prefix. */
export function mkOptLookupName(raw: string): OptName {
  return mkOptName(raw.replace(/^no_?/i, ""))
}

export function mkCondOp(raw: string): CondOp {
  return trim(raw) as CondOp
}

export function mkOptFlagChar(raw: string): OptFlagChar {
  return trim(raw) as OptFlagChar
}

export function mkBuiltinName(raw: string): BuiltinName {
  return trim(raw) as BuiltinName
}
