// Single-flight promise cache that retries on rejection: the resolved value
// is cached and shared, but a rejection clears the cache so the next call
// re-attempts. Contrast `@carlwr/typescript-extra`'s `memoized`, which caches
// rejections permanently. For runtime network loads where a transient
// failure must not wedge later attempts.

export function memoizedRetry<T>(f: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | null = null;
  return () => {
    if (!cached) {
      cached = f().catch((e) => {
        cached = null;
        throw e;
      });
    }
    return cached;
  };
}
