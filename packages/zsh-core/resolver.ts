/**
 * @packageDocumentation
 * Corpus-aware resolution of raw zsh tokens, per category or across the
 * category walk; hits carry the record and lossy-resolution feedback.
 */

export {
  type ResolvedHit,
  type ResolverFeedback,
  resolve,
  resolveAll,
} from "./src/docs/resolver.ts"
