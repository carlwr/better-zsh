// `corpus_hash`: identifies the corpus an index was built from. Same inputs
// as the Rust original (zshref-rs/src/nlp/index.rs): package version, the
// upstream zsh tag, then per category its name and per record the compact
// JSON of the projected record, length-prefixed. Equality with the Rust
// value is not a goal; a rebuilt index carries a fresh hash either way.

import { createHash } from 'node:crypto';
import type { DocCorpus } from '@carlwr/zsh-core';
import { PKG_VERSION, ZSH_UPSTREAM } from '@carlwr/zsh-core/meta';
import { projectCorpus } from './projection';

export interface HashInputs {
  version: string;
  tag: string;
  /** In index order; records as they serialize (`JSON.stringify`). */
  categories: readonly { name: string; records: readonly unknown[] }[];
}

export function corpusHash(corpus: DocCorpus): string {
  return hashInputs({
    version: PKG_VERSION,
    tag: ZSH_UPSTREAM.tag,
    categories: projectCorpus(corpus).map(({ category, records }) => ({ name: category, records }))
  });
}

/** SHA-256 hex over NUL-terminated fields; record lengths are UTF-8 byte counts. */
export function hashInputs({ version, tag, categories }: HashInputs): string {
  const h = createHash('sha256');
  const field = (s: string) => h.update(s, 'utf8').update(NUL);
  field(version);
  field(tag);
  for (const { name, records } of categories) {
    field(name);
    for (const rec of records) {
      const json = JSON.stringify(rec);
      field(String(Buffer.byteLength(json, 'utf8')));
      field(json);
    }
  }
  return h.digest('hex');
}

const NUL = Buffer.from([0]);
