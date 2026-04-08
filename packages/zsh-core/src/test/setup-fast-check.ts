import fc from "fast-check"

const FC_SEED = 16042026

fc.configureGlobal({
  seed: FC_SEED,
})
