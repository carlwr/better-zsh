import fc from "fast-check"

// Per AGENTS.md §"Reproducibility matters": pin a checked-in seed so
// fast-check runs are deterministic across the orchestrator's repeated
// suite runs. Mirror of `packages/zsh-core/src/test/setup-fast-check.ts`.
const FC_SEED = 16042026

fc.configureGlobal({
  seed: FC_SEED,
})
