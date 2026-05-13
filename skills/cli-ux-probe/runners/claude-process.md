# Runner: claude-process

External `claude` CLI as subprocess; isolated from orchestrator.

## Eval requires `--bare`

`--bare` disables OAuth + auto-loaded CLAUDE.md + auto-memory. Without it, `~/.claude/projects/<encoded-cwd>/memory/*.md` re-enters AUT context across runs → exclusion-triggering per SKILL.md "Memory files". Evaluations **must** use `--bare`; skill development / smoke is OK in keychain mode.

`--bare` skips OAuth so an API key is required. Convention: the key is stored with a leading underscore (e.g. `_ANTHROPIC_API_KEY`) and exported on demand — `ANTHROPIC_API_KEY="$_ANTHROPIC_API_KEY" claude --bare …`. If `$_ANTHROPIC_API_KEY` is unset/empty, **do not run claude-process for evaluation** unless the human explicitly opts in to the keychain path.

## Invocation (one-shot)

```sh
if [[ -n "${_ANTHROPIC_API_KEY:-}" ]]; then
  export ANTHROPIC_API_KEY="$_ANTHROPIC_API_KEY"
  BARE=--bare
else
  BARE=          # keychain OAuth path — dev/smoke only; not for eval
fi

(
  cd "$scratch" &&
  PATH="$scratch:$PATH" \
  CLI_UX_PROBE_REAL_BIN="$real_bin" \
  CLI_UX_PROBE_TRACE_FILE="$trace" \
  timeout 120 claude -p $BARE \
    --model haiku \
    --output-format json \
    --setting-sources "" \
    --strict-mcp-config \
    --permission-mode bypassPermissions \
    --tools Bash,Read \
    --add-dir "$scratch" \
    -- "$prompt" </dev/null \
    > "$run_dir/claude.json" \
    2> "$run_dir/claude_stderr.txt"
)
```

Flag notes:

- run from `$scratch` in a subshell; cwd controls Bash access, while `--add-dir` scopes Read-tool access
- env assignments must prefix the `timeout claude` command inside the subshell (prefix scopes to one command)
- `--setting-sources ""` — suppress `~/.claude/settings.json` + project `.claude/settings.json` (orthogonal to `--bare`; keep on both paths)
- `--output-format json` — required for token capture; redirect stdout to file or you lose it
- `--tools` is **variadic** — without `--` separator it swallows the prompt as a tool name (error: `Input must be provided either through stdin or as a prompt argument when using --print`)
- `</dev/null` + `timeout` — see SKILL.md "Defensive invocation"

`HOME=$scratch` breaks OAuth (state at `$HOME/.claude.json` + `$HOME/.claude/`); the keychain dev path needs real `$HOME`. `--bare` ignores OAuth entirely so `HOME` placement is moot there.

## Model selection

`--model haiku` (alias) or full id. Cheap-fleet entry: `haiku`. Verify via probe.

Canonical id surfaces in `--output-format json` (path varies by version — recent versions expose it under `.modelUsage` keys):

```sh
jq -r '.modelUsage | keys[]' < claude.json
# -> e.g. claude-haiku-4-5-<datestamp>
```

## System-prompt control

- `--system-prompt <text>` — replace default
- `--append-system-prompt <text>` — add

For domain-blind probes, `--system-prompt` with a minimal stub. Record chosen text.

Cost trade-off: minimal stub drops the cached default-prompt prefix (non-trivial; tens of thousands of tokens on current models). Two effects compete: smaller per-turn input vs. less amortization across turns. SP framing **also shifts AUT behavior** — observed across runs: same task may run more or fewer tool calls under minimal SP vs default, and the direction is unpredictable. Often dominates the per-turn savings. Crude rule: minimal cheaper for very short runs; default usually cheaper otherwise. Measure if cost matters. AUT capability not materially changed for well-framed prompts.

## Output collection

- `$run_dir/claude.json` — stdout JSON object
- `$run_dir/claude_stderr.txt` — stderr notices/errors, if any
- `.result` — final assistant message
- trace JSONL — primary CLI-usage evidence

## Token usage

`--output-format json` yields one object with `.result` (final text) plus a `.usage` block (input/output tokens, cache-read/cache-create when surfaced), a top-level cost field, and a per-model usage map. Exact field names shift across versions — pin selectors against the live schema with `jq` before depending on them.

**Capture to file every time** (incl. probes) — unredirected, totals can't be aggregated:

```sh
jq -c '{tokens_in: .usage.input_tokens, tokens_out: .usage.output_tokens,
        cache_create: .usage.cache_creation_input_tokens,
        cache_read: .usage.cache_read_input_tokens,
        cost_usd: .total_cost_usd}' < "$run_dir/claude.json"
```

Cache-read tokens are dominated by default system-prompt re-read per tool-iteration; grow roughly linearly with tool-call count. Subtract / report cache-read separately when comparing across run lengths.

## Exam mode (2-phase)

Two `claude -p` invocations sharing a session id; `--tools ""` in phase 2 disables tool use at the process level — true mechanical rug-pull, no AUT cooperation needed.

```sh
uuid=$(uuidgen)
# phase 1 — same as the one-shot above, plus --session-id $uuid;
# prompt instructs AUT to explore and signal readiness (e.g. ending with "READY")
ANTHROPIC_API_KEY="$_ANTHROPIC_API_KEY" claude -p --bare ... \
  --tools Bash,Read --session-id "$uuid" -- "$p1_prompt"

# phase 2 — no tools, no shim env needed (AUT has no Bash anyway)
ANTHROPIC_API_KEY="$_ANTHROPIC_API_KEY" claude -p --bare ... \
  --tools "" --resume "$uuid" -- "$p2_prompt"
```

## Caveats

- multi-turn requires `--input-format stream-json --output-format stream-json` for single-process streaming (one-shot is `-p`; for two-phase exam use `--session-id`/`--resume` as above)
- non-`--bare` keychain path loads `~/.claude/CLAUDE.md` + `~/.claude/projects/<encoded-cwd>/memory/*` — see "Eval requires `--bare`" above
- `--permission-mode bypassPermissions` removes guardrails; don't point at sensitive dirs
- final text at `.result`; tool calls in nested structures — verify with `jq` per installed version
