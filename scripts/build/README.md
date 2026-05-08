# Workspace Build Scripts

Rationale only. Exact commands live in `package.json` and nearby scripts.

## Aims

- Quiet success by default.
  Common gates run often. Long successful logs waste context.
- Bounded failure output.
  Keep the useful tail and name the verbose rerun.
- One command graph.
  Executable task data cuts `*:verbose` aliases and gives the verifier the runner graph.
- Fresh upstream artifacts.
  Recursive gates must not let package `pre*` hooks race on shared upstream `dist/`.
- Rust parity without stale JSON.
  CLI targets rebuild TS artifacts before cargo reads monorepo data.

## Rejected

- Shell redirects in `package.json`.
  Easy to hide useful errors. No clear rerun path.
- Per-task verbose aliases.
  Worked, but made the root manifest harder to scan.
- Raw recursive pnpm for guarded tasks.
  Simpler text, unsafe with upstream rebuild hooks and tsup `clean`.
- Rationale comments in one `.mjs` file.
  The design spans multiple scripts.

## Enforcement

- Wrapper contract: synthetic tests in `quiet-run.test.mjs`.
- Real-script silence: `smokeScripts` list in the same file.
- New front-facing pnpm scripts: add to `smokeScripts` so `qa` catches drift.
