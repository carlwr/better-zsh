# Runner: claude-subagent

Orchestrator's Agent tool. Cheap, fast, in-process; useful for skill iteration but **leaky** — subagent inherits orchestrator project context.

## Exam mode: NOT SUPPORTED

The Agent tool has no orchestrator-side continuation primitive in current Claude Code (`SendMessage` referenced in tool docs but not surfaced as a callable tool). A fresh Agent call starts from scratch; the subagent cannot be handed new user turns after it returns. Use a process runner for exam mode.

## When to use

- skill development; smoke tests
- baseline runs interpreted with leakage awareness
- `usage` / `task` modes only (see "Exam mode: NOT SUPPORTED" above)
- **not for evaluation** — subagent always inherits parent context (memory, project files, MCP); use isolated process runners for any eval the user cares about

## Invocation

Agent tool, `subagent_type: general-purpose` (or per orchestrator judgement). Pass task/exam prompt via Agent `prompt`.

Env doesn't flow from the orchestrator's shell into the subagent — see "Env routing". Inject via the prompt:

```
The CLI you must use is at `<absolute path to shim symlink>`. Either:

- invoke it via that absolute path, OR
- prepend its directory to PATH in each Bash call.

Each Bash call that invokes the tool must also export the shim's env vars
(every call: subagent Bash calls run in fresh subshells; env never carries):

  export CLI_UX_PROBE_REAL_BIN=<absolute path to real binary>
  export CLI_UX_PROBE_TRACE_FILE=<absolute path to trace file>

(Required for the shim to function. Don't reason about them.)
```

The path leaks; CLI behaviour does not — probe principle still holds. SKILL.md step 6 catches the silent-failure case.

## Env routing

Each Bash tool call is a fresh subshell of the harness, inheriting only the harness env; vars set in one call don't propagate (to a later Bash call, or into a subagent). Process runners fork their CLI directly with an env-var prefix; the Agent tool has no equivalent, so env must go via the prompt.

Forgetting this: AUT resolves `<cli-name>` against the harness PATH (often a different same-named binary on disk), trace stays empty, AUT's report still looks plausible.

## Isolation

None worth claiming.

- inherits parent context, tools, MCP, working tree access
- can read maintainer docs, skill files, `AGENTS.md`, etc.

Treat as **leak baseline**. The leakage probe registering project files is expected here, not a failure.

## Model selection

Agent tool's `model` param (`haiku` / `sonnet` / `opus`). Cheap-fleet entry: `haiku`.

## System-prompt control

Not user-controllable. Subagent runs under parent harness stock system prompt + agent-type overrides.

## Output collection

- Agent returns a single final message; primary signal
- trace file — secondary, usually richer

## Token usage

The Agent tool does not return per-subagent token usage. Report as "tokens: n/a (subagent)"; rely on isolated runners for token-cost signal.

## Caveats

- subagent may decline tasks it interprets as adversarial; phrasing matters
- subagent may volunteer information that biases later evaluation; orchestrator filters
- do not instruct the subagent to "read this skill" — defeats the probe
