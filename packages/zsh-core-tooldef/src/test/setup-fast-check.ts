import fc from "fast-check"

// Per AGENTS.md (reproducibility): pinned seed matches `@carlwr/zsh-core`
// test setup so fast-check stays deterministic across repeated runs.
const FC_SEED = 16042026

fc.configureGlobal({
  seed: FC_SEED,
})
