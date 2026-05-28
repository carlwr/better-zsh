// BGE-small embedder via @huggingface/transformers (ORT-Web). Lazy load
// on first embed; runtime tries WebGPU first, falls back to WASM. Model
// assets cached by transformers.js's default browser strategy.

import type { ProgressInfo } from '@huggingface/transformers';
import { memoizedRetry } from './memoizedRetry';

const MODEL_ID = 'BAAI/bge-small-en-v1.5';
const DIMS = 384;

export type FeatureExtractionPipeline = (
  inputs: string | string[],
  opts?: { pooling?: 'mean' | 'cls' | 'none'; normalize?: boolean }
) => Promise<{ data: Float32Array; dims: number[] }>;

/** Aggregate byte progress of the one-time model download, summed across the
 * files transformers.js fetches from the Hub. `total` grows as new files start;
 * a cached model emits little or nothing (no download). */
export type ModelProgress = { loadedBytes: number; totalBytes: number };

let progressListener: ((p: ModelProgress) => void) | null = null;

/** Observe the model download so the UI can show real, not guessed, MB. */
export function onModelProgress(cb: ((p: ModelProgress) => void) | null): void {
  progressListener = cb;
}

const defaultPipeline = memoizedRetry(async (): Promise<FeatureExtractionPipeline> => {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowRemoteModels = true;
  const files = new Map<string, { loaded: number; total: number }>();
  return (await pipeline('feature-extraction', MODEL_ID, {
    dtype: 'fp32',
    progress_callback: (e: ProgressInfo) => {
      // Only per-file byte updates carry file/loaded/total; ignore the rest.
      if (!progressListener || !('file' in e) || !('total' in e)) return;
      if (typeof e.total !== 'number') return;
      const loaded = 'loaded' in e && typeof e.loaded === 'number' ? e.loaded : 0;
      files.set(e.file, { loaded, total: e.total });
      let loadedSum = 0;
      let totalSum = 0;
      for (const f of files.values()) {
        loadedSum += f.loaded;
        totalSum += f.total;
      }
      progressListener({ loadedBytes: loadedSum, totalBytes: totalSum });
    }
  })) as unknown as FeatureExtractionPipeline;
});

/**
 * Embed a query the way `zshref-rs` does: `query: ` prefix (the index builder
 * embeds documents with `passage: `), CLS pooling, unit-normalized. Returns a
 * 384-dim Float32Array.
 *
 * `pipe` is for tests using a local on-disk model; production omits it.
 */
export async function embedQuery(
  query: string,
  pipe?: FeatureExtractionPipeline
): Promise<Float32Array> {
  const p = pipe ?? (await defaultPipeline());
  const out = await p(`query: ${query}`, { pooling: 'cls', normalize: true });
  if (out.data.length !== DIMS) {
    throw new Error(`embedder returned ${out.data.length} dims, expected ${DIMS}`);
  }
  return out.data instanceof Float32Array ? out.data : new Float32Array(out.data);
}
