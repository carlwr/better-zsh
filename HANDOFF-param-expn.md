# Handoff: `param_expn` DocCategory

Residual notes from the `param_expn` addition. **Delete on the pass that
integrates the outstanding items below.**

## Design decisions (for the DESIGN.md fold-in)

These apply alongside the `redir`-identity and `param_flag` rationale
already in DESIGN.md:

- **Identity = full sig, not an "operator".** Same precedent as `redir` —
  `${name:-word}` and `${name-word}` are separate records, not
  sub-variants of a `:-` operator.
- **`simpleResolver` kept for totality, not utility.** `param_expn` sigs
  are literal doc templates; no user-code token will ever match them. The
  category is reached via `zsh_search` + `zsh_describe`. Kept in the
  resolver table so the closed-union completeness guards stay coherent.
- **`subKind` is a fixed closed union, not a computed label.** Literal
  values; extending the union is a deliberate, single-point change.
- **Placeholders extracted via an exact-string table, not regex.** The
  table is the single source of truth for both `subKind` and
  operand-slot names (`name`, `word`, `pattern`, `repl`, `spec`,
  `arrayname`, `offset`, `length`). Silent upstream renames trip the
  "unknown sig" throw on the next build.
- **No raw-text resolver.** Considered and dropped — the added testing
  burden outweighed the zero practical value given the template-shape
  of sigs.

## Outstanding items

1. **DESIGN.md refresh** — fold the "Design decisions" section above
   into DESIGN.md where it naturally fits. Source material above; this
   file goes away once folded.
2. **Post-release `dist/json/param-expns.json`** — if the deferred
   `plan-json-artifacts.md` plan lands (JSON as GitHub release assets
   rather than npm subpaths), retire the `./data/param-expns.json` /
   `./schema/param-expns.schema.json` exports alongside the others.
3. **Sanity-render via the MCP** — with the next MCP release that pulls
   updated `@carlwr/zsh-core`, verify `zsh_describe { category:
   "param_expn", id: "${name:-word}" }` returns a well-formatted doc
   block and that `zsh_search { query: "expansion" }` surfaces sensible
   matches.
