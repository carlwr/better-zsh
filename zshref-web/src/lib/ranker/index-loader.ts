// Parse + validate a `VectorIndex` JSON blob. Vector arrays are converted
// to `Float32Array` by the zod schema (`F32Vec` transform) so reads round-
// trip to the same f32 values Rust emitted.

import { VectorIndexSchema, type VectorIndex } from './types';

export function loadVectorIndex(raw: unknown): VectorIndex {
  return VectorIndexSchema.parse(raw);
}
