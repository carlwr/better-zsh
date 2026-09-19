/**
 * @packageDocumentation
 * Corpus-aware resolution of raw zsh tokens, per category or across the
 * category walk; hits carry the record and lossy-resolution feedback.
 */

export {
  type AnyResolvedHit,
  type ResolvedHit,
  type ResolverFeedback,
  type ResolverFeedbackKindSchema,
  type ResolverFeedbackKindSchemas,
  resolve,
  resolveAll,
  resolverFeedbackKindSchemas,
  resolverFeedbackKinds,
} from "./src/docs/resolver.ts"
