// Pinned fast-check seed, the same as zsh-core's (TESTING.md: a fixed
// checked-in seed), so property tests replay identically.
import fc from "fast-check"

const FC_SEED = 16042026

fc.configureGlobal({ seed: FC_SEED })
