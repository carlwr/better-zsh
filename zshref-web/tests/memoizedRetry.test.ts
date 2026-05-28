// Locks the cache semantics consumers depend on: evaluate-once on success,
// single-flight while pending, re-attempt after a rejection (the bit that
// distinguishes it from typescript-extra's `memoized`).

import { describe, expect, it } from 'vitest';
import { memoizedRetry } from '../src/lib/memoizedRetry';

describe('memoizedRetry', () => {
  it('evaluates once and caches the resolved value', async () => {
    let calls = 0;
    const get = memoizedRetry(async () => ({ n: ++calls }));
    const a = await get();
    const b = await get();
    expect(calls).toBe(1);
    expect(b).toBe(a);
  });

  it('shares one in-flight promise across concurrent calls', async () => {
    let calls = 0;
    let release!: (v: number) => void;
    const get = memoizedRetry(() => {
      calls++;
      return new Promise<number>((r) => (release = r));
    });
    const p1 = get();
    const p2 = get();
    expect(p1).toBe(p2);
    expect(calls).toBe(1);
    release(7);
    expect(await p1).toBe(7);
  });

  it('re-attempts after a rejection instead of caching it', async () => {
    let calls = 0;
    const get = memoizedRetry(() =>
      ++calls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('ok')
    );
    await expect(get()).rejects.toThrow('boom');
    await expect(get()).resolves.toBe('ok');
    expect(calls).toBe(2);
  });
});
