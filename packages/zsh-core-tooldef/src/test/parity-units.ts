/**
 * Authoritative TS↔Rust parity surface. `mirror-pairs.test.ts` and
 * `parity.test.ts` derive from this; add a row before new mirror pairs.
 */

export interface ParityUnit {
  readonly name: string
  /** Repo-relative paths; first line must be `// MIRRORED-IN: <rs>`. */
  readonly ts: readonly string[]
  /** Repo-relative path; must carry `// MIRROR-OF:` for each `ts` entry. */
  readonly rs: string
  /** When set, `parity.test.ts` treats this unit as one `toolDefs` entry. */
  readonly toolName?: string
  readonly notes?: string
}

export const parityUnits = [
  {
    name: "resolver",
    ts: [
      "packages/zsh-core/src/docs/resolver.ts",
      "packages/zsh-core/src/docs/normalize-option.ts",
    ],
    rs: "zshref-rs/src/resolver.rs",
  },
  {
    name: "record-fields",
    ts: ["packages/zsh-core/src/docs/json-projection.ts"],
    rs: "zshref-rs/src/tools/record_fields.rs",
  },
  {
    name: "envelope",
    ts: [
      "packages/zsh-core-tooldef/src/tools/entries.ts",
      "packages/zsh-core-tooldef/src/tools/result.ts",
    ],
    rs: "zshref-rs/src/tools/envelope.rs",
  },
  {
    name: "tool:docs",
    ts: ["packages/zsh-core-tooldef/src/tools/docs.ts"],
    rs: "zshref-rs/src/tools/docs.rs",
    toolName: "zsh_docs",
  },
  {
    name: "tool:list",
    ts: ["packages/zsh-core-tooldef/src/tools/list.ts"],
    rs: "zshref-rs/src/tools/list.rs",
    toolName: "zsh_list",
  },
  {
    name: "tool:search",
    ts: ["packages/zsh-core-tooldef/src/tools/search.ts"],
    rs: "zshref-rs/src/tools/search.rs",
    toolName: "zsh_search",
    notes: "Fuzzy tier diverges by design; see parity.test.ts header.",
  },
] satisfies readonly ParityUnit[]

export const parityToolDefNames: readonly string[] = parityUnits.flatMap(u =>
  u.toolName !== undefined ? [u.toolName] : [],
)
