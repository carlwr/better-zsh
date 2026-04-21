# CLI Visual Policy

Framework-agnostic rules for human-facing CLI output in repo CLIs: the current `zshref` (Rust+clap under `zshref-rs/`) and any future ones.

This doc covers visual *what*/*why*; the CLI's own tests cover what is practical to assert. Change either, check the other. Keep even hard-to-assert rules here.

Strengths:
- **MUST**: contract-breaking if violated; always tested
- **SHOULD**: strong default; test when practical
- **MAY**: soft preference or option

## Streams & color

- **MUST**: reserve `stdout` for machine-parseable output. A successful invocation writes only that.
- **MUST**: send human output to `stderr`: `--help`, `--version`, errors, warnings, progress. Keeps `prog | jq` clean; paged help remains `prog --help 2>&1 | less`.
- **SHOULD**: pretty-print JSON on `stdout`: indented, newline-terminated. Use compact JSON only for a measured bandwidth reason.
- **MUST**: auto-disable ANSI color when the destination stream is not a tty (`isTTY` or equivalent).
- **MUST**: if `NO_COLOR` is set and non-empty, disable ANSI unconditionally, per <https://no-color.org>.
- **MAY**: accept `NOCOLOR` too.
- **MUST**: document color in `--help`, preferrably suitable dedicated section headings:
  - exit codes:
    - `0`: success
    - `1`: internal or unexpected error
    - `2`: bad input (malformed flag, unknown enum, missing required argument)
  - env vars (for color, and preferrably any other)

## --help: typography & layout

### For human scannability

#### Why?

(IMPORTANT: this section, including the fenced blocks, may not be edited by agents, unless the human user has explicitly allowed it)

The below examples use an imagined terminal window width of 30 columns to illustrate principles. In reality, a terminal window width of at least _80 columns_ may be assumed.

For an imagined terminal window 30 columns wide, if text is rendered as illustrated below, the output is very unpleasant for humans to read:
UNACCEPTABLE:
```
---
  -h,--help   - print the
help message
  -v          - print program
version
---
COL=30 marker:               ^
```

ACCEPTABLE - full line kept <30 cols:
```
---
  -h,--help   - print help
  -v          - print version
---
COL=30 marker:               ^
```

ACCEPTABLE, but slightly less preferred - continued lines are properly indented, ensured by inserted hard newlines:
```
---
  -h,--help   - print the
                help message
  -v          - print program
                version
---
COL=30 marker:               ^
```

#### How

Adhering to the following rules would be _one way_ (there may be other) to ensure the output is of acceptable shape:
- for any prose that starts at COL=1 (any of:):
  - lines may have arbitrary length, since the terminal wrapping won't cause indentation inconsistencies (wrapping can happen within words, therefore, this is less preferred)
  - lines are hard-wrapped at word boundaries so that all lines stay <=80 cols
- for any prose that does _not_ start at COL=1, every line is kept within `80` columns (incl. margin for framework indent)

Another way of describing the same thing: We can hard-wrap at 80 columns or less, as long as it does not result in non-indented line continuations.

NOTE: line length refers to number of characters _after ANSI stripping_ (since ANSI control sequences does not consume horizontal terminal space)

### General

- **MAY**: for `--help` print help for all subcommands (slightly preferred over needing `prog subcommand --help` for each `subcommand` to discover the full `--help` text for all subcommands)
- **SHOULD**: avoid runs of `3+` blank lines; usually a paragraph-break bug.
- **SHOULD**: split long descriptions into paragraphs with blank lines between logical sections.
- **SHOULD**: drop non-load-bearing hyphens. `parameter expansion flag` wraps better than `parameter-expansion flag`; keep hyphens when meaning changes.
- **SHOULD**: render enumerations one (possibly indented) item per line, not comma-heavy inline prose.
- **SHOULD**: keep `Options` descriptions short and single-paragraph. Put enum tables or references in top-level `Description`, where the column is (possibly) wider.
- **SHOULD**: keep any one option to roughly a flag line plus a few continuation rows. `~6` physical rows is a good soft cap; tune per CLI.
- **MUST**: in top-level `--help`, state the I/O contract: what `stdout` carries, where human output goes, and the exit-code map.
- **MUST**: add an `Examples:` section (for the top-level `prog --help`) with a small set of common invocations; often the fastest onboarding surface.
- **SHOULD**: keep each subcommand `Description` non-empty: say what it does and returns.

## option-arguments (`--option=OPTION-ARG` etc.)

- **MAY**: accept both of the two forms `--option=OPTION-ARG` and `--option OPTION-ARG`
- **note**: if only one form is supported, the `--option=OPTION-ARG` form is preferred

## "Usage:"-line forms etc.

- **MUST**: make the `Usage:` line end with a useful synopsis, never just the program name. `prog <command> [options]` is fine; bare `prog` looks like a crash.
- **MUST**: _not_ give `Usage:` line(s) that are inconsistent with valid usage
  - example:
    - given: `--query` is mandatory, and has a mandatory option-arg, i.e. valid forms are `prog --query=QUERY ..`/`prog --query QUERY ..`
    - -> a usage line `prog [--query] ..` would be _actively misleading_ for two separate reasons: 1.) the []s in `[--query]` suggests `--query` is not mandatory, and, separately, 2.) `[--query]` suggests `--query` does not have a mandatory option-arg
    - note: this rule is about `Usage:` lines only. E.g. if an "Options:" section describes such an option with the line "  [--query]   - search string (default: --query='.*')", then that does not violate this rule
- **MUST**: be case-consistent if placeholders are repeated (so that their identity can be inferred)
  - example: if a `Usage:` line is `prog --to=FILE ..`, an `Options:` text may _not_ say "`file` must be a readable file...", but must if referenced be referenced as "`FILE` must be a readable file..."
- **MAY/SHOULD** use upper-case for placeholders (`--to=FILE`, not `--to=file`)

## args/options specs

- **MUST**: somehow communicate what the default is for boolean-like flags that are not required
- **SHOULD**: visually flag required options: `(required)`, unbracketed placement in `Usage:`, or both.

## Subcommand CLIs

- **MUST**: IF some help contents requires a subcommand-specific `--help` invocation (`prog sub --help`), THEN clear information about these `--help` forms must be provided in the top-level `--help`
- **SHOULD**: in top-level `--help`, list subcommands with one-line briefs. Aim for `~50` chars to avoid wrapping the `Commands` column.
- **SHOULD**: write briefs as phrases, not sentences: lowercase first letter, no trailing period. `classify a raw zsh token, return its doc`, not `Classify a raw zsh token.`
- **SHOULD**: in subcommand `--help`, show `brief`, blank line, expanded description. If the framework uses the first description line as the top-level brief, format it as `brief\n\nexpanded` instead of plumbing a separate `brief` field.
- **SHOULD**: omit redundant `Version:` lines from subcommand `--help`; the root program already shows the version.
- **MAY**: skip subcommand `Examples:` when `Usage:` is already clear; root-level examples are usually more useful.

## Testing discipline

- **SHOULD**: keep visual-presentation tests in a dedicated file, separate from behavior/contract tests.
- **SHOULD**: give that file a top-of-file comment stating its purpose.
- **SHOULD**: gate rules that are mechanically assertable; rely on review plus this doc for the rest.
- **SHOULD**: use generous layout thresholds; catch runaway regressions, not normal growth.

## Drift control

- **MUST**: when a rule here changes, update the matching test or add one. When a visual test changes, check this doc too.
- **MUST**: keep this doc framework-neutral. Framework-, toolkit-, or library-specific notes belong in a separate file.
