# Workspace Build Scripts

Rationale only. Exact commands live in `package.json` and nearby scripts.

## Aims

- Quiet success by default.
  Common gates run often. Long successful logs waste context.
- Bounded failure output.
  Keep the useful tail and name the verbose rerun.
- One command graph.
  Executable task data cuts `*:verbose` aliases and keeps the runner graph in one place.
- Fresh upstream artifacts.
  Recursive gates must not let package `pre*` hooks race on shared upstream `dist/`. A per-package content stamp decides whether a rebuild is needed at all, and makes a skip-upstream claim checkable.
- No stale embedded JSON.
  CLI targets rebuild TS artifacts before cargo reads monorepo data.

## Rejected

- Shell redirects in `package.json`.
  Easy to hide useful errors. No clear rerun path.
- Per-task verbose aliases.
  Worked, but made the root manifest harder to scan.
- Raw recursive pnpm for guarded tasks.
  Simpler text, unsafe with upstream rebuild hooks and tsup `clean`.
- Static policing of script and workflow text.
  Pattern-matched shell strings to forbid raw upstream builds; the stamp checks the same claim at the point of use, where it cannot be spelled around.
- Rationale comments in one `.mjs` file.
  The design spans multiple scripts.

## Enforcement

- `pnpm test:scripts` / `pnpm qa`: every `scripts/build/*.test.mjs` (see `build-tasks.mjs`). Wrapper behavior lives in `quiet-run.test.mjs`; other gates are sibling files in that directory.
- Real-script silence: `smokeScripts` list in `quiet-run.test.mjs`.
- New front-facing pnpm scripts: add to `smokeScripts` so `qa` catches drift.
