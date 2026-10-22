// markdown-it owns fence detection; its `highlight` hook hands each code
// block to Shiki. Dual light/dark via Shiki's CSS-variable mode
// (`defaultColor: false`) so one HTML reacts to the `data-theme` attribute.

import docoptGrammar from "@carlwr/docopt-tmlanguage/grammar.json"
import { memoizedRetry } from "@carlwr/typescript-extra"
// markdown-it v15 bundles its own types: the default export is a callable
// back-compat wrapper (a value), so the class type is the named export.
import MarkdownIt, { type MarkdownIt as Md } from "markdown-it"
import { createHighlighterCore, type LanguageRegistration } from "shiki/core"
import { createOnigurumaEngine } from "shiki/engine/oniguruma"

// Fine-grained imports: the `shiki` bundle would ship its whole grammar and
// theme catalogue as lazy chunks, each under its own licence. A grammar or
// theme added here needs its licence in the package notices.
const THEMES = { light: "github-light", dark: "github-dark" } as const

async function build(): Promise<Md> {
  const hl = await createHighlighterCore({
    themes: [
      import("shiki/themes/github-light.mjs"),
      import("shiki/themes/github-dark.mjs"),
    ],
    langs: [
      // also registers its zsh/sh/bash/shell aliases
      import("shiki/langs/shellscript.mjs"),
      docoptGrammar as unknown as LanguageRegistration,
    ],
    engine: createOnigurumaEngine(import("shiki/wasm")),
  })
  const known = new Set(hl.getLoadedLanguages())
  return new MarkdownIt({
    html: false,
    linkify: false,
    breaks: false,
    highlight: (code, info) => {
      const lang = info.toLowerCase()
      return hl.codeToHtml(code, {
        lang: known.has(lang) ? lang : "text",
        themes: THEMES,
        defaultColor: false,
      })
    },
  })
}

// Single-flight: the highlighter (themes + grammars) is built once, lazily,
// and shared across every render; a failed build is retried on the next.
const getMd = memoizedRetry(build)

export async function renderMarkdown(src: string): Promise<string> {
  const md = await getMd()
  return md.render(src)
}

// Record titles are short inline markdown (backticked names, *operands*,
// `_(form N of M)_`). They carry no fenced code, so Shiki never runs — a plain
// synchronous MarkdownIt renders them without the async highlighter build,
// keeping headings cheap. `html: false` escapes any stray markup, so `{@html}`
// of record titles stays injection-safe.
// `renderInline` emits inline HTML with no wrapping <p>.
const inlineMd = new MarkdownIt({ html: false, linkify: false, breaks: false })

export function renderInline(src: string): string {
  return inlineMd.renderInline(src)
}
