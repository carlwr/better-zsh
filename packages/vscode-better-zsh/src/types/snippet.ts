import { z } from "zod"

const snippetCategorySchema = z.enum([
  "complex-cmd",
  "declaration",
  "idiom",
  "pattern",
])

export const zshSnippetSchema = z.object({
  prefix: z.string().min(1),
  name: z.string().min(1),
  body: z.array(z.string()),
  desc: z.string().min(1),
  category: snippetCategorySchema,
  syntax: z.string().min(1).optional(),
})

export type ZshSnippet = z.infer<typeof zshSnippetSchema>
