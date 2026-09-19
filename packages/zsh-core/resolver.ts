/**
 * @packageDocumentation
 * Corpus-aware resolution of raw zsh tokens; hits carry lossy-resolution feedback.
 */

export {
  type ResolvedHit,
  type ResolverFeedback,
  type ResolverFeedbackKindSchema,
  type ResolverFeedbackKindSchemas,
  resolve,
  resolverFeedbackKindSchemas,
  resolverFeedbackKinds,
} from "./src/docs/resolver.ts"
