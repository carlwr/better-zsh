import type { DocCategory } from "../docs/taxonomy"
import { mkDocumented, mkObserved } from "../docs/brands"
import type { Documented, Observed } from "../docs/types"

export const mkDocumented_ =
  <K extends DocCategory>(cat: K) =>
  (raw: string): Documented<K> =>
    mkDocumented(cat, raw)

export const mkObserved_ =
  <K extends DocCategory>(cat: K) =>
  (raw: string): Observed<K> =>
    mkObserved(cat, raw)
