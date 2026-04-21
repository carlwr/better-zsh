/**
 * TEMPORARY: strip hand-wrapping from `ToolDef.description` strings for the
 * Rust CLI's JSON export.
 *
 * Today, tool-def descriptions in `tool-defs.ts` and `tools/*.ts` are
 * hand-wrapped at ~70 cols because the two TS CLI adapters (cliffy,
 * stricli) render them verbatim and would otherwise overflow the terminal.
 * The Rust CLI (clap) wants flow prose and will do its own terminal-width
 * wrapping. This function bridges the two worlds during the experiment.
 *
 * When the TS CLI adapters are retired, tool-def descriptions will be
 * written as flow prose directly and THIS FILE CAN BE DELETED along with
 * the call site in `export-json.ts`.
 *
 * Semantics:
 *   - Paragraph break = blank line (/\n{2,}/). Preserved.
 *   - Within a paragraph: lines starting with whitespace are preserved
 *     verbatim (they encode structure — indented bullets, continuations).
 *   - Adjacent non-indented lines are joined with a single space → flow
 *     prose, relying on the downstream renderer to re-wrap.
 */
export function unwrapDescription(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(unwrapParagraph)
    .join("\n\n")
}

function unwrapParagraph(para: string): string {
  const out: string[] = []
  let flow: string[] = []
  const flush = () => {
    if (flow.length > 0) {
      out.push(flow.join(" "))
      flow = []
    }
  }
  for (const line of para.split("\n")) {
    if (/^\s/.test(line)) {
      flush()
      out.push(line)
    } else {
      flow.push(line)
    }
  }
  flush()
  return out.join("\n")
}
