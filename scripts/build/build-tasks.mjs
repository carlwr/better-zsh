const pkg = name => `pnpm --filter ${name}`
const recursive = script =>
  `node scripts/build/upstream-ready.mjs run pnpm -r --filter './packages/*' --if-present ${script}`

export const buildTasks = {
  build: `${pkg("better-zsh")} build`,
  format:
    "pnpm format:root && pnpm -r --filter './packages/*' --if-present format",
  lint: "pnpm lint:root && pnpm -r --filter './packages/*' --if-present lint",
  typecheck: recursive("typecheck"),
  check: `pnpm lint:symlinks && pnpm lint:md && pnpm lint:root && ${recursive("check")}`,
  test: "pnpm lint && pnpm test:unit",
  "test:unit": recursive("test"),
  "test:scripts": "node --test 'scripts/build/*.test.mjs'",
  // `lint:slowtypes` runs `deno publish --dry-run --no-check` on zsh-core: registry-independent, catches JSR slow-types regressions in seconds.
  // `cli` precedes `test:unit`: the TS/Rust parity suite compares against the
  // release binary and skips itself when that binary is stale, and no other leg
  // of this chain builds `--release`. Its extra `artifacts` pass is a stamp
  // check, not a rebuild.
  qa: `pnpm check && ${pkg("@carlwr/zsh-core")} run lint:slowtypes && pnpm cli && pnpm test:unit && pnpm test:scripts && pnpm cli:qa`,
  "test:integration": recursive("test:integration"),
  vsix: `${pkg("better-zsh")} vsix`,
  // Recursive, not a per-package chain: every member self-builds, so without
  // the readiness helper shared upstream `dist/` is rebuilt once per member.
  // Docs site is a published artifact too: typedoc / api-extractor breaks
  // belong here, not in the container run.
  "test:pack": `${recursive("test:pack")} && pnpm docs:zsh-core`,
  cli: "make cli",
  "cli:debug": "make cli-debug",
  "cli:test": "make cli-test",
  "cli:check": "make cli-check",
  // One make invocation: `cli-test` and `cli-check` both depend on
  // `artifacts`; chaining via pnpm would rebuild artifacts twice.
  "cli:qa": "make cli-test cli-check",
}
