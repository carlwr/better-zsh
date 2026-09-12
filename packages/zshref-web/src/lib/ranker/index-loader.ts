// Parse + validate a `VectorIndex` JSON blob. Vector arrays are converted
// to `Float32Array` by the zod schema (`F32Vec` transform) so reads round-
// trip to the f32 values the index build embedded.

import { type VectorIndex, VectorIndexSchema } from './types';

export function loadVectorIndex(raw: unknown): VectorIndex {
  return VectorIndexSchema.parse(raw);
}
