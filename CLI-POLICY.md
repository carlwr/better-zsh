---
audience: maintainer
read-when: designing or auditing CLI behaviour
---

# CLI Policy

_Opinionated, agent-era._

---

Framework-agnostic rules for human- and agent-facing CLI output.

This doc covers visual *what*/*why* and part of the behaviour contract; the CLI's own tests cover what is practical to assert. Change either, check the other. Keep even hard-to-assert rules here.

Strength indicators:

| Indicator | Meaning |
|-|-|
| **MUST** | contract-breaking if violated; test when possible |
| **SHOULD** | strong default; test when practical |
| **MAY** | soft preference or option |
| **note:** | informational |

## ABOUT: Motivation for this document and its choices

_The text under this section may only be edited by humans. It may not be edited by agents._

**Premise:**
- User attention is a scarce resource. Everything the user reads dilutes his/her attention.
- A user invoking `--help` gives us, the authors of the CLI tool, write-permission straight into the short-term memory of the user. The user has no way to undo such a write operation.

**Consequence:** We must handle this permission, should we get it by the user invoking `--help`, with care.

In the above, "user" can be replaced with "a human developer" or "an agent"/"an AI model". Humans pay with time and cognitive load. AI models pay with token costs and attention dilution.

---

## Streams, exit codes, color

Streams:
- **MUST** send errors, warnings, messages and prose to stderr — never to stdout (exceptions: explicit help/version/usage output; in-band parseable errors such as JSON error objects within a JSON output stream)
- **SHOULD**[^streams] when the user explicitly invokes the program for help, version, or usage info (`--help`, `-h`, `--version`, `-V`, `help` subcommand, etc., to the extent supported), emit that output to stdout
- **SHOULD** if the program has no sensible default action when invoked bare (no args, no subcommand), treat bare invocation as an implicit help request — emit full top-level help to stdout and exit `0` (byte-identical to `--help` is fine)
- **note:** rationale:
  - pipelines parse stdout — unsolicited prose belongs on stderr
  - help/version is an exception, enabling the `prog --help | less` idiom
  - bare invocation is not an error — the user hasn't asked for anything yet; offer help rather than fail

[^streams]: sending help/version/usage to stderr is not forbidden — a CLI may have legitimate reasons (e.g. keeping stdout unconditionally machine-output, robust against accidental or malicious `-h` injection inside scripts/pipelines, etc.)

Exit codes:
- **MUST** use:
  - `0`: success
  - non-`0`: non-success
- **SHOULD** use:
  - `1`: internal or unexpected error
  - `2`: bad input (malformed flag, unknown enum, missing required argument)
  - ...and may additionally use other non-`0` exit codes

Color:
- **MUST** auto-disable ANSI color when the destination stream is not a tty
- **MUST** honor `NO_COLOR` — if set and non-empty, disable ANSI unconditionally
- **SHOULD** honor `CLICOLOR_FORCE` — if non-empty and not `0`, enable ANSI even without a tty

Top-level `--help`:
- **MUST** specify/document environment variables that affect ANSI colors

## Option-arguments (`--option=OPTION-ARG` etc.)

- **MAY** accept both of the two forms `--option=OPTION-ARG` and `--option OPTION-ARG`
- **note:** if only one form is supported, the `--option=OPTION-ARG` form is preferred

## JSON output format (if applicable)

- **SHOULD** choose policy for whitespaces, indentation and newlines deliberately
- **SHOULD** for output of "record nature" prefer one physical line per record (this preserves rudimentary `grep`-friendliness for quick non-`jq` filtering)
- **SHOULD** within records, prefer compact JSON for agent/JSONL pipelines
- **SHOULD** pretty-print (indented, multi-line objects) when human inspection is primary, or via an explicit flag
- **note:** if no `--pretty` flag is offered, having `--help` advise `| jq` for pretty-printing is a useful mitigation

## `--help` output

### The _wrapping-may-not-lose-indentation_ rule

#### Why?

For human scannability.

#### What?

(IMPORTANT: this section, including the fenced blocks, may not be edited by agents, unless the human user has explicitly allowed it)

The below examples use an imagined terminal window width of 30 columns to illustrate principles. In reality, a terminal window width of at least _80 columns_ may be assumed.

For an imagined terminal window 30 columns wide, if text is rendered as illustrated below, the output is very unpleasant for humans to read:
UNACCEPTABLE:
```diff
 ---
-  -h,--help   - print the
-help message
-  -V          - print program
-version
 ---
 COL=30 marker:               ^
```

ACCEPTABLE - full line kept <30 cols:
```diff
 ---
+  -h,--help   - print help
+  -v          - print version
 ---
 COL=30 marker:               ^
```

ACCEPTABLE, but slightly less preferred - continued lines are properly indented, ensured by inserted hard newlines:
```diff
 ---
   -h,--help   - print the
                 help message
   -v          - print program
                 version
 ---
 COL=30 marker:               ^
```

Reminder: this rule is not applicable to lines/paragraphs that start on COL=1/don't start indented, this wrapping is of course OK:
```diff
 ---
 Lorem ipsum dolor sit amet,
 consectetur adipiscing elit.
 ---
 COL=30 marker:               ^
```

**note:** line length is considered _after ANSI stripping_ — ANSI control sequences don't consume horizontal terminal space.

### Layout & wrapping

- **note:** for layout- and wrapping concerns, assuming the user terminal width is 80 columns or more is acceptable
- **SHOULD** split long descriptions into paragraphs with `1` blank line between paragraphs
- **MAY** (sparingly) use `2` blank lines to separate content into broader logical units
- **SHOULD** avoid runs of `3+` blank lines; usually a paragraph-break bug
- **SHOULD** drop non-essential hyphens — `parameter expansion flag` wraps better than `parameter-expansion flag`
- **SHOULD** render enumerations one (possibly indented) item per line, not comma-heavy inline prose
- **SHOULD** cap any one paragraph at a handful of physical rows; use paragraph breaks to aid scanning rather than runaway prose

### Structure & sections

- **MAY** in top-level `--help`, print help for all subcommands inline (slightly preferred over requiring `prog subcommand --help` for each)
- **SHOULD** structure `--help` output with this disposition:
  ```
  <one- or few-line intro>
  <"Usage:" section>
  <sections for subcommands and options, in some order>
  <further help text, examples, other sections etc.>
  ```
- **SHOULD** add an `Examples:` section (for the top-level `prog --help`) with a small set of common invocations
- **SHOULD** keep each subcommand `Description` non-empty

### Content & phrasing

- **SHOULD** keep each flag's `--help` (long) description concise — prefer 1–2 short paragraphs; multi-paragraph is fine when it aids scannability
- **SHOULD** keep each flag's `-h` (short) description to a single terse phrase — this is the column-constrained form
- **MAY** add inline length cues to long-output commands/options (e.g. `--schema    emit the JSON schema (4231 words)`) — nudges humans to `| less`, agents to filter or truncate
- **MUST** ensure any user-facing shell code that pipes from stderr uses the exact form `{ PRODUCER 2>&1; } | CONSUMER`; that form gives the desired behaviour in all of:
  - `bash`
  - `zsh` with the MULTIOS option set
  - `zsh` with the MULTIOS option _unset_

**MAY** omit prose when deemed not to provide much additional information:
```diff
 Environment:
-  NO_COLOR          always disable ANSI color
-  CLICOLOR_FORCE    enable ANSI color also without tty
+  NO_COLOR
+  CLICOLOR_FORCE
```

### Arguments, options, and `Usage:` lines

- **MUST** indicate the default for non-required boolean-like flags
- **SHOULD** visually flag required options: `(required)`, unbracketed placement in `Usage:`, or both
- **SHOULD** make the `Usage:` line end with a useful synopsis, not just the program name — `prog <command>` is fine; bare `prog` looks like a mistake
- **SHOULD** use upper-case for placeholders (`--to=FILE`, not `--to=file`)

**MUST** _not_ give `Usage:` line(s) that are inconsistent with valid usage. Example:
```diff
 Description:
   --query is mandatory. It takes a mandatory option-argument.
 Usage:
-  prog [--query] ..
+  prog --query=QUERY ..
```
Misleading on two grounds:
- brackets imply `--query` is optional
- missing `=QUERY` implies no option-arg

The above rule applies to `Usage:` lines only. An "Options:" entry like `  [--query]   - search string (default: '.*')` does not violate it.

**MUST** be case-consistent if placeholders are repeated (so identity can be inferred):
```diff
 Usage:
   prog --to=FILE ..
 Options:
-  --to=FILE   ...  file must be readable.
+  --to=FILE   ...  FILE must be readable.
```

**note:** it is _allowed_ to whitespace-pad the `Usage:` forms if vertical columns improve readability and overview:
```diff
 Usage:
   prog get    --key=K   [--category=C]             [--pretty]
   prog search --query=Q [--category=C] [--limit=L] [--pretty]
   prog list             [--category=C] [--limit=L] [--pretty]
```

### Consistency: ordering, case, and more

**MUST** be consistent in case:

```diff
 Usage:
   prog give
   prog take

 Commands:
   give      give something
-  take      Take something
+  take      take something
```

**MUST** be consistent in ordering:

```diff
 Usage:
   prog give --from=FROM [--to=TO]
   prog take --from=FROM

 Commands:
-  take      take something
-  give      give something
+  give      give something
+  take      take something

 Options:
-  --to      destination (default: stdout)
-  --from    the source
+  --from    the source
+  --to      destination (default: stdout)

 Example:
-  prog give --to=/dev/you --from=/dev/me
+  prog give --from=/dev/me --to=/dev/you
```

**SHOULD** be consistent between `--help` (long output) and `-h` (brief output), if the two forms are not identical:

```diff
 $ prog --help
 Usage:
   prog [--verbose] [--pretty]
 Options:
   --verbose
       be verbose
   --pretty
       be pretty

 $ prog -h
-Usage: prog [--pretty] [--verbose] 
-Options:
-  --pretty
-  --verbose
+Usage: prog [--verbose] [--pretty]
+Options:
+  --verbose    be verbose
+  --pretty     be pretty
```

### Subcommand-style CLIs

- **MUST** _if_ some help contents requires a subcommand-specific `--help` invocation (`prog sub --help`), _then_ clear information about these `--help` forms must be provided in the top-level `--help`
- **SHOULD** in top-level `--help`, list subcommands with one-line briefs; aim for `~50` chars; ensure no wrapping at an 80-char terminal width
- **SHOULD** in subcommand `--help`, structure as: brief, blank line, expanded description
- **note:** if the framework uses the first description line as the top-level brief, format the description as `brief\n\nexpanded` rather than plumbing a separate `brief` field
- **MAY** omit `Version: <version>` etc. from both top-level and subcommand `--help`, when a dedicated `--version`/`version` exists
- **MAY** skip `Examples:` when `Usage:` is already clear

**SHOULD** write briefs as phrases, not sentences:
```diff
 Options:
-  log    Show commit logs.
+  log    show commit logs
```

### The _Farmor ritar och berättar_ anti-pattern ("_Grandma's sketch-and-tell_")

_Symptom:_ overexplained prose that narrates around the point instead of stating it concisely and directly.

Example:

```diff
Commands:
-  info
-    The `info` command emits metadata on the corpus. It is printed as JSON,
-    and formatting is similar to that of other subcommands if they are
-    invoked with the `--pretty` option. Here, passing `--pretty` is not
-    illegal, but it is a no-op. If there is other metadata on upstream
-    sources it is also (pretty-)printed.
-
+  info
+    emit metadata for corpus + upstream as pretty-printed JSON
+
```

("_Farmor ritar och berättar_" (sv), literally "Grandma draws and tells". Ref.: Anders Bengtsson, 2002.)

## Testing discipline

- **SHOULD** keep visual-presentation tests separate from behaviour/contract tests
- **SHOULD** gate rules that are mechanically assertable; rely on review plus this doc for the rest
- **SHOULD** use generous layout thresholds; catch runaway regressions, not normal growth

**MUST** use appropriately permissive assertions:
```diff
 mustMatchRE =
-  m/\[Default: ${DEFAULT}\]/
+  m/default: ${DEFAULT}/i
```

## Drift control

- **MUST** when a rule here changes, update the matching test or, if possible, add one
- **MUST** when a visual test changes, check this doc
- **MUST** keep this doc framework-neutral — framework-, toolkit-, or library-specific notes belong in a separate file

## Framework-fighting

- **MUST** use judgement when deciding _what fights with the framework are worth picking_ to comply with this document; work-arounds and hand-patching:
  - increase code volume
  - are sensitive to framework bumps
  - transfer testing burden from the framework dep to our own code

  Depending on the trade-off, consider:
  - demoting a **MUST** to a **SHOULD**
  - adding to a known-policy-violations list (if any)
  - similar accommodations

## References

(for inspiration and background — opinions in mentioned references do not necessarily align with those of this document)

- https://clig.dev/
  - archived: https://web.archive.org/web/20260421220553/https://clig.dev/
- https://12factor.net/
- https://jdxcode.medium.com/12-factor-cli-apps-dd3c227a0e46
  - archived: https://web.archive.org/web/20230331054252/https://medium.com/@jdxcode/12-factor-cli-apps-dd3c227a0e46
- https://nix.dev/manual/nix/2.34/development/cli-guideline.html
  - archived: https://web.archive.org/web/20260507134226/https://nix.dev/manual/nix/2.34/development/cli-guideline.html
- https://no-color.org
- https://en.wikipedia.org/wiki/Unix_philosophy
  - related reading: http://www.ceri.memphis.edu/people/smalley/ESCI7205_misc_files/The_truth_about_Unix_cleaned.pdf
    - archived: https://web.archive.org/web/20260323102441/http://www.ceri.memphis.edu/people/smalley/ESCI7205_misc_files/The_truth_about_Unix_cleaned.pdf
