/**
 * @packageDocumentation
 * Corpus-aware resolution of raw zsh tokens, per category or across the
 * category walk; hits carry the record and lossy-resolution feedback.
 */

export {
  type ResolvedHit,
  type ResolverFeedback,
  type ResolverFeedbackKindSchema,
  resolve,
  resolveAll,
  resolverFeedbackKindSchemas,
  resolverFeedbackKinds,
} from "./src/docs/resolver.ts"
