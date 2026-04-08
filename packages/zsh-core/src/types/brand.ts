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

/** Smart constructor: lowercases and strips underscores. */
export function mkOptName(raw: string): OptName {
  return raw.replace(/_/g, "").toLowerCase() as OptName
}

export function mkCondOp(raw: string): CondOp {
  return raw.trim() as CondOp
}

export function mkOptFlagChar(raw: string): OptFlagChar {
  return raw.trim() as OptFlagChar
}

export function mkBuiltinName(raw: string): BuiltinName {
  return raw.trim() as BuiltinName
}
