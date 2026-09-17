// BGE-small embedder via @huggingface/transformers (ORT-Web). Lazy load on
// first embed, re-attempted after a failed Hub download; runs on WASM
// (transformers.js's browser default — no `device` is passed). Model assets
// cached by transformers.js's default browser strategy.

import { memoizedRetry } from "@carlwr/typescript-extra"
import type { ProgressInfo } from "@huggingface/transformers"
import { DIMS, MODEL_ID } from "../core/types"

export type FeatureExtractionPipeline = (
  inputs: string | string[],
  opts?: { pooling?: "mean" | "cls" | "none"; normalize?: boolean },
) => Promise<{ data: Float32Array; dims: number[] }>

/** Byte progress of the model load, summed over every file transformers.js
 * fetches; the total is known from the first event (file sizes are looked up
 * upfront). A cached model reaches it at once. */
export type ModelProgress = { loadedBytes: number; totalBytes: number }

let progressListener: ((p: ModelProgress) => void) | null = null

/** Observe the model download so the UI can show real, not guessed, MB. */
export function onModelProgress(cb: ((p: ModelProgress) => void) | null): void {
  progressListener = cb
}

const defaultPipeline = memoizedRetry(
  async (): Promise<FeatureExtractionPipeline> => {
    const { pipeline, env } = await import("@huggingface/transformers")
    env.allowRemoteModels = true
    return (await pipeline("feature-extraction", MODEL_ID, {
      dtype: "fp32",
      // `progress_total` is the pipeline's own aggregate over its files.
      progress_callback: (e: ProgressInfo) => {
        if (e.status === "progress_total")
          progressListener?.({ loadedBytes: e.loaded, totalBytes: e.total })
      },
    })) as unknown as FeatureExtractionPipeline
  },
)

/**
 * Embed one text the way the index build embeds a record (the Node embedder):
 * CLS pooling, unit-normalized; a `DIMS`-long Float32Array. Prefix-free —
 * search passes `queryEmbedText`'s output.
 *
 * `pipe` is for tests using a local on-disk model; production omits it.
 */
export async function embedText(
  text: string,
  pipe?: FeatureExtractionPipeline,
): Promise<Float32Array> {
  const p = pipe ?? (await defaultPipeline())
  const out = await p(text, { pooling: "cls", normalize: true })
  if (out.data.length !== DIMS) {
    throw new Error(
      `embedder returned ${out.data.length} dims, expected ${DIMS}`,
    )
  }
  return out.data instanceof Float32Array
    ? out.data
    : new Float32Array(out.data)
}
