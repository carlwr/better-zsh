// The eval metric (NLP.md §"Eval architecture"): each expected item is one
// vote, graded on its own rank by `gain`; a category scores the weighted
// mean of its votes, the total the unweighted mean over categories — so a
// category with 100 votes counts as much as one with 5. f32 throughout, as
// zshref-rs/src/nlp/sentence_fixture.rs computes it. β and the target
// depths are fixed human-judgment values, never tuning knobs.

import { byteOrder } from '../byte-order';

const f = Math.fround;

/** Global sharpness of the rank discount. */
export const BETA = 2;

/** f32 `powf`: the double power of two f32 values, rounded once. */
const powf = (x: number, y: number): number => f(x ** y);

/**
 * Normalized rank discount in (0, 1]: `D(r) = 1 / (1 + (r/d)^β)`, scaled so
 * `gain(1) = 1`; monotone decreasing in the 1-based `rank`, polynomial tail.
 * `d` is the item's target depth.
 */
export function gain(rank: number, d: number, beta: number = BETA): number {
  const [dd, b] = [f(d), f(beta)];
  return f(f(1 + powf(f(1 / dd), b)) / f(1 + powf(f(f(rank) / dd), b)));
}

/** Tune-on (`train`) vs held-out (`holdout`): the ranker is tuned against
 * `train` only; a tune that lifts `train` but not `holdout` is overfitting. */
export type Split = 'train' | 'holdout';

/** One scored unit: an expected item's contribution on its own rank. */
export interface Vote {
  category: string;
  weight: number;
  gain: number;
  split: Split;
}

/** Per category, sorted by name (byte order): Σ w·gain / Σ w. */
export interface Score {
  perCategory: Map<string, number>;
  total: number;
}

export function score(votes: readonly Vote[]): Score {
  const sums = new Map<string, { gains: number; weights: number }>();
  for (const v of votes) {
    const s = sums.get(v.category) ?? { gains: 0, weights: 0 };
    s.gains = f(s.gains + f(v.weight * v.gain));
    s.weights = f(s.weights + v.weight);
    sums.set(v.category, s);
  }
  // Sorted before summing: the f32 sum depends on the order (Rust folds a BTreeMap).
  const perCategory = new Map(
    [...sums]
      .sort(([a], [b]) => byteOrder(a, b))
      .map(([c, s]): [string, number] => [c, s.weights > 0 ? f(s.gains / s.weights) : 0])
  );
  let sum = 0;
  for (const s of perCategory.values()) sum = f(sum + s);
  return { perCategory, total: perCategory.size === 0 ? 0 : f(sum / f(perCategory.size)) };
}

/** `score` over the votes of one split. */
export const scoreSplit = (votes: readonly Vote[], split: Split): Score =>
  score(votes.filter((v) => v.split === split));

/** Overall and per-split scores plus per-category item counts, for reporting. */
export interface EvalResult {
  all: Score;
  train: Score;
  holdout: Score;
  nEntries: number;
  perCategoryN: Map<string, number>;
}

export function evalResult(votes: readonly Vote[], nEntries: number, perCategoryN: Map<string, number>): EvalResult {
  return {
    all: score(votes),
    train: scoreSplit(votes, 'train'),
    holdout: scoreSplit(votes, 'holdout'),
    nEntries,
    perCategoryN
  };
}
