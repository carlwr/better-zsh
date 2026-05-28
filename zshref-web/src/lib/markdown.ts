// markdown-it owns fence detection; its `highlight` hook hands each code
// block to Shiki. Dual light/dark via Shiki's CSS-variable mode
// (`defaultColor: false`) so one HTML reacts to the `data-theme` attribute.

import { memoized } from '@carlwr/typescript-extra';
import MarkdownIt from 'markdown-it';
import { createHighlighter, type LanguageRegistration } from 'shiki';
import docoptGrammar from '@carlwr/docopt-tmlanguage/grammar.json';

const THEMES = { light: 'github-light', dark: 'github-dark' } as const;

// Loading `shellscript` also registers its zsh/sh/bash/shell aliases.
const LANGS = ['shellscript', docoptGrammar as unknown as LanguageRegistration];

async function build(): Promise<MarkdownIt> {
  const hl = await createHighlighter({ themes: Object.values(THEMES), langs: LANGS });
  const known = new Set(hl.getLoadedLanguages());
  return new MarkdownIt({
    html: false,
    linkify: false,
    breaks: false,
    highlight: (code, info) => {
      const lang = info.toLowerCase();
      return hl.codeToHtml(code, {
        lang: known.has(lang) ? lang : 'text',
        themes: THEMES,
        defaultColor: false
      });
    }
  });
}

// Single-flight: the highlighter (themes + grammars) is built once, lazily,
// and shared across every render.
const getMd = memoized(build);

export async function renderMarkdown(src: string): Promise<string> {
  const md = await getMd();
  return md.render(src);
}

// Record titles are short inline markdown (backticked names, *operands*,
// `_(form N of M)_`). They carry no fenced code, so Shiki never runs — a plain
// synchronous MarkdownIt renders them without the async highlighter build,
// keeping result-card and record-page headings cheap. `html: false` escapes
// any stray markup, so `{@html}` of corpus-sourced titles stays injection-safe.
// `renderInline` emits inline HTML with no wrapping <p>.
const inlineMd = new MarkdownIt({ html: false, linkify: false, breaks: false });

export function renderInline(src: string): string {
  return inlineMd.renderInline(src);
}
