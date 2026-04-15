import type { DocCategory } from "../docs/taxonomy"
import {
  type Candidate,
  mkCandidate,
  mkProven,
  type Proven,
} from "../docs/types"

export const mkProven_ =
  <K extends DocCategory>(cat: K) =>
  (raw: string): Proven<K> =>
    mkProven(cat, raw)

export const mkCandidate_ =
  <K extends DocCategory>(cat: K) =>
  (raw: string): Candidate<K> =>
    mkCandidate(cat, raw)
