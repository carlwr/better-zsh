/**
 * @packageDocumentation
 * Corpus-aware resolution of raw zsh tokens plus optional lossy-resolution feedback.
 */

export {
  lookupRaw,
  type ResolverFeedback,
  type ResolverFeedbackKindSchema,
  type ResolverFeedbackKindSchemas,
  resolve,
  resolverFeedback,
  resolverFeedbackKindSchemas,
  resolverFeedbackKinds,
} from "./src/docs/resolver.ts"
