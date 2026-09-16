// `corpus_hash`: identifies the corpus an index was built from. Its only job
// is "was this index built from this corpus?" — a rebuilt index carries a
// fresh hash either way.

import { createHash } from "node:crypto"
import type { DocCorpus } from "@carlwr/zsh-core"
import { PKG_VERSION, ZSH_UPSTREAM } from "@carlwr/zsh-core/meta"
import { projectCorpus } from "./projection"

export interface HashInputs {
  version: string
  tag: string
  /** In index order; records as they serialize (`JSON.stringify`). */
  categories: readonly { name: string; records: readonly unknown[] }[]
}

export function corpusHash(corpus: DocCorpus): string {
  return hashInputs({
    version: PKG_VERSION,
    tag: ZSH_UPSTREAM.tag,
    categories: projectCorpus(corpus).map(({ category, records }) => ({
      name: category,
      records,
    })),
  })
}

/** SHA-256 hex of the inputs' JSON. */
export const hashInputs = (inputs: HashInputs): string =>
  createHash("sha256").update(JSON.stringify(inputs), "utf8").digest("hex")
