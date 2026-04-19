# Handoff: `param_expn` DocCategory

Single-commit addition on branch `cats`. Adds a new `DocCategory`
`param_expn` — parameter-expansion forms from zshexpn's PARAMETER EXPANSION
section (`${name}`, `${name:-word}`, `${name/pattern/repl}`, …).

This file is the checked-in handoff for the post-merge pass; delete on the
pass that integrates the outstanding items below.

## Why

Parameter expansion is one of the common, hard-to-google, high-leverage bits
of zsh knowledge. The existing `param_flag` category covers the `(U)`, `(L)`
etc. *flags* inside `${(…)x}`; it does not cover the enclosing expansion
forms themselves. Agents using the MCP/extension tools had no path to
answer "what is the `${name:-word}` form?" other than free-text recall.
`param_expn` closes that gap structurally, via the same A/B/C architecture
as every other category:
- **A (parsed docs):** one `ParamExpnDoc` record per sig; sigs that share a
  doc chunk in the manual (e.g. the three `replace` forms) carry identical
  `desc` and know each other via `groupSigs`.
- **B (fact extraction):** none needed — the category is not resolved from
  live user-code tokens (see "`simpleResolver` kept for totality" below).
- **C (markdown rendering):** `mdParamExpn` shows the focused sig plus its
  sibling family in a `zsh` code block with a `# <- this form` arrow.

Full shape: 32 records across 18 `ParamExpnSubKind` values (`plain`,
`set-test`, `default`, `alt`, `assign`, `err`, `strip-pre`, `strip-suf`,
`exclude`, `array-remove`, `array-retain`, `array-zip`, `substring`,
`replace`, `length`, `rc-expand`, `word-split`, `glob-subst`).

Design decisions (captured here so the post-merge DESIGN.md pass has one
place to pull from):
- **Identity = full sig, not an "operator".** Same precedent as `redir` —
  `${name:-word}` and `${name-word}` are separate records, not
  sub-variants of a `:-` operator.
- **`simpleResolver` kept for totality, not utility.** `param_expn` sigs
  are literal doc templates; no user-code token will ever match them. The
  category is reached via `zsh_search` + `zsh_describe`. Kept in the
  resolver table so the closed-union completeness guards stay coherent.
- **subKind is a fixed closed union, not a computed label.** 18 literal
  values; extending the union is a deliberate, single-point change.
- **Placeholders extracted via an exact-string table, not regex.** The
  table is the single source of truth for both subKind and operand-slot
  names (`name`, `word`, `pattern`, `repl`, `spec`, `arrayname`, `offset`,
  `length`). Silent upstream renames trip the "unknown sig" throw on the
  next build.
- **No raw-text resolver.** Considered and dropped — the added testing
  burden outweighed the zero practical value given the template-shape of
  sigs.

## What changed

### `packages/zsh-core/` (the substance)

- `src/docs/types.ts` — new `ParamExpnSubKind` literal union, new
  `ParamExpnDoc extends SyntaxDocBase<Documented<"param_expn">>`.
- `src/docs/taxonomy.ts` — category registration: `docCategories`,
  `classifyOrderTuple` (+ placement rationale comment), `docCategoryLabels`,
  `DocRecordMap`, `docId`.
- `src/docs/brands.ts` — `norm` entry (trim-only).
- `src/docs/corpus.ts` — `DocCorpus` field, `categoryLoader` entry (uses
  `expn.yo`), `resolvers` entry (+ inline "totality not utility" note).
- `src/docs/yodl/extractors/param-expns.ts` — **new.** Parses the
  `Parameter Expansion` section of zshexpn; builds source-ordered
  `groupSigs` via `collectAliasedEntries`; classifies via an exact-string
  `SIG_CLASSIFICATION` table; throws on unknown sigs. Also carries a
  `fixupUpstreamTypos` pre-parse step patching one verbatim upstream
  snippet (`` `tt(%)' and `tt(#%) are not active `` → adds the missing
  closing `'`); removing becomes a no-op once upstream fixes the typo.
- `src/docs/json-artifacts.ts` + `src/docs/json-types.ts` — JSON artifact
  mapping (`param-expns.json`, `ParamExpnsJson`, `paramExpns` count key).
- `src/render/md.ts` — `mdParamExpn` renderer + registration in
  `mdRenderer`.
- `src/render/dump.ts` — `param-expns.md` dump file; `suspiciousPatterns`
  widened from `RegExp` to `(md) => boolean` predicates and a new
  `unbalanced inline backticks` heuristic added (see next section); a
  pinned `knownBacktickOffenders` set whitelists pre-existing offenders so
  the heuristic stays live as a regression guard.
- `package.json` — `./data/param-expns.json` and
  `./schema/param-expns.schema.json` subpath exports (required by the
  `json-artifacts.test.ts` shared-surface assertion; see also the deferred
  `plan-json-artifacts.md` — both will move together if that plan lands).

### `packages/zsh-core-tooldef/` (auto-propagates)

No source edits. Tool descriptions interpolate from
`docCategories` / `docCategoryLabels`; tests iterate `docCategories`; all
pick up the new category on the next build.

### `packages/zshref-mcp/` (README only)

- `README.md` — one new bullet in the "exposed structured knowledge" list:
  `parameter-expansion forms (${name:-word}, ${name/pattern/repl}, …)`.

No source changes. The MCP's typecheck + unit + stdio tests passed locally.

### `packages/vscode-better-zsh/` (deliberately minimal; not tested)

The worktree starts with extension tests in an already-failing state (as
noted at kick-off). **Extension tests were not run during this change.**
The edits here are the minimum to keep the `DocCorpus` shape compilable
and the cross-package drift test passing — nothing more:

- `package.json` — added `'param_expn'` to the comma-separated enum string
  in `contributes.languageModelTools[...].inputSchema.properties.category.description`.
  Required to keep `src/test/zsh-ref-tools.test.ts` (drift against
  `toolDefs`) passing on merge.
- `src/test/completions.test.ts` — added `param_expn: emptyMap as DocCorpus["param_expn"]`
  to the explicit `DocCorpus` literal. Required to keep that file type-checking.
- `src/test/hover-provider.test.ts` — added `param_expn: mt`. Same reason.
- `src/dev/dump-refs.ts` — added `param_expn: "param expansions"` to the
  `categoryLabel` record (exhaustive per `DocCategory`). Same reason.

## Known backtick-heuristic offenders

A new "unbalanced inline backticks" predicate was added to
`suspiciousPatterns` during this change — per-line parity of `` ` ``
characters outside fenced code blocks, which reliably catches inline-code
spans that never closed. Running it against the current vendored corpus
surfaced 10 hits:

- **3 in the new `param_expn.replace` family** — same root cause, an
  upstream typo in `expn.yo:838`. Fixed here via `fixupUpstreamTypos`.
- **7 pre-existing** — not in scope for this commit, pinned in
  `knownBacktickOffenders` in `dump.ts`. Each should be audited and the
  entry dropped when the root cause is fixed:
  - `option:globassign` — upstream: `` `name=pattern `` unclosed inline-code
    span in `options.yo`.
  - `option:cshjunkiequotes` — upstream: complex `` `$`, ``' or `"` ``
    passage with multi-quote oddity in `options.yo`.
  - `builtin:print` — pipeline-level: `finishPlain` strips the `\` inside a
    `` `\` '' `` source span before `renderInlineMd` can wrap it as inline
    code, leaving a lone `` ` ``. Fix lives in `yodl/core/text.ts` —
    apostrophe-stripping should not run inside backtick-delimited regions.
  - `builtin:source` — extractor bug: `extractAlias` in
    `yodl/extractors/builtins.ts` uses `/\bSame as ([^.\s]+)/`, which
    captures the leading backtick of `` Same as `.' `` instead of the
    name. Fix: skip an optional leading backtick and/or strip the
    surrounding inline-code syntax.
  - `prompt_escape:%[xstring]`, `prompt_escape:%<string<`,
    `prompt_escape:%>string>` — same shared desc; likely one upstream typo
    in `prompt.yo`. Locate and patch analogously to the `param_expn` fixup.

The check is live for every category: any *new* offender outside this set
trips `render/render.test.ts > render dump > vendored docs > avoids known
suspicious patterns`.

## Post-merge TODO

1. **Run the extension tests.** Whatever was already broken in the
   worktree should be fixed (or fail for the same reason as before this
   change — not a new reason). Confirm the `zsh-ref-tools.test.ts` drift
   test passes against the updated manifest enum string.
2. **Regenerate `pnpm-lock.yaml`** if any package boundary changed (it
   didn't here, but the integration CI will confirm).
3. **DESIGN.md refresh** — fold the "Design decisions" section above into
   DESIGN.md where it naturally fits (alongside the redir-identity and
   param-flag rationale). The rationale is load-bearing for future
   contributors deciding whether novel categories should follow the same
   shape.
4. **Post-release `dist/json/param-expns.json`** — this file will appear
   in the next `@carlwr/zsh-core` build. If the deferred
   `plan-json-artifacts.md` plan lands (JSON as GitHub release assets
   rather than npm subpaths), retire the `./data/param-expns.json` /
   `./schema/param-expns.schema.json` exports alongside the others.
5. **Sanity-render via the MCP** — with the next MCP release that pulls
   updated `@carlwr/zsh-core`, verify `zsh_describe { category:
   "param_expn", id: "${name:-word}" }` returns a well-formatted doc block
   and that `zsh_search { query: "expansion" }` surfaces sensible matches.
6. **Drain `knownBacktickOffenders`** — see "Known backtick-heuristic
   offenders" above. Five known root causes, independent of each other;
   each drop-off is a one-or-two-line edit plus removing the entry from
   the set.

## Tests run during this change

```
pnpm --filter @carlwr/zsh-core           test    # 330 pass (was 300; +30)
pnpm --filter @carlwr/zsh-core-tooldef   test    #  62 pass (unchanged)
pnpm --filter @carlwr/zshref-mcp         test    #  17 pass, 11 skipped

pnpm --filter @carlwr/zsh-core           typecheck  # clean
pnpm --filter @carlwr/zsh-core-tooldef   typecheck  # clean
pnpm --filter @carlwr/zshref-mcp         typecheck  # clean

pnpm --filter @carlwr/zsh-core           lint       # clean
pnpm --filter @carlwr/zsh-core-tooldef   lint       # clean
pnpm --filter @carlwr/zshref-mcp         lint       # clean
```

Not run: anything in `packages/vscode-better-zsh/`, integration tests,
smoke/install/JSR dry-runs. Defer to post-merge CI.
