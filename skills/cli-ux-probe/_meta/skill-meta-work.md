# Meta: on improving and working on this skill itself


## Assumptions

- common tools are available (e.g.: `jq`, `check-jsonschema`)

- the orchestrator is a competent model/agent
  - -> can course-correct on problems
  - -> phrasing in the skill should
    - nudge toward allowing the orchestrator to use judgement
    - not be overly prescriptive in absolute terms, unless really warranted
  - -> the skill can lean towards _what to achive_ (robust) rather than _exactly what to do/how to achieve it_ (would be less robust)


## Maintenance-conservative stance

- maintenance burden of this skill must be kept low

- actively protect SKILL.md against incuring maintenance burden e.g. by relying on accidental behaviors of runners or of the environment/platform

Note: runners (like `claude`, `codex` etc.) generally receive version updates every few days.


## Robustness

Many moving parts and high ecosystem churn -> "works on this machine" is a weak
signal on its own.

Guidelines:

- avoid, or at least consider the trade-off, of introducing scripts or recipes with portability issues
  - examples
    - using lsof (differs between GNU and BSD versions; differs between versions)
    - relying on explicit file descriptor paths (differs between platforms)


- the skill should document the running of the sanity probe in a way that makes it likely to float issues before the real AUT tests

- some defensiveness is shell script style is warranted (early errors can be valuable in this context)


## Documented recipes vs. committed scripts

noted asymmetry:

- _scripts_ require higher robustness than _documented recipes_
  - since: it is more natural and expected for an orchestrator to course-correct and adjust on recipes than on committed scripts

noted tension between these two aspects:

1. "do not check-in a lot of post-processing shellscripts - that's code to
maintain, easily become stale, should preferrably have tests that check them"

2. "avoid each orchestrator having to re-invent the same analysis scripts and
jq expressions to analyze performed runs"

This tension requires good judgement and deliberate tradeoffs — there are no always-true-and-correct answers.


## Runing the skill/acting as the orchestrator

all meta-testing of the skill should:

- use maximally cheap agents (e.g. Haiku, GPT-5.4-mini)

- use AUT tasks that is expected not to invite to long chains of reasoning and invocations of the binary (still, the tasks must be tailored so that models cannot easily answer from memory, but will be likely to invoke the binary)

- **always set a very conservative invocation budget** (`CLI_UX_PROBE_MAX_INVOCATIONS=3–5`) and pair with `claude -p --max-budget-usd` when applicable — this is infrastructure testing, not the real probe; total session cost belongs in cents


## Local/machine-specific notes

(This section is added as an exception.)

runners vs. models/plans available:
- `claude`: Anthropic models
- `codex`, `opencode`: OpenAI models


## Misc.
 
- `claude-subagent`: mostly useful as a first shake-down - `claude-process` is what exercises the skill fully

- for changes/improvements of the skill, documenting why-s/rationales is generally preferred -> protects against future edits/refactoring losing the improvements


---

## TBD notes (ignore unless instructed by user)

- Skill should tell orchestrator to create tasks and examns before it learns
anything about the CLI (except for its topic etc), e.g. for zshref: don't
read its help or its code prior to creating tasks and exams; if a zsh
reference is needed use `man zsh` - this avoids bias/inadvertently tailoring
the exams/tasks to the current CLI design choices (which is what we want to
test/challenge)

- test and verify that agents can invoke batch mode properly (the only mode
that exercises stdin of the cli)

- protect AUT contexts mechanically

- cost/rate limit queries

- is exam mode broken?

- central for analysis: the cli invocations _after --help is invoked the
first time_ - filter out invocations before that; possibly per subcommand
