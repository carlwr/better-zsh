---
audience: maintainer
read-when: running or writing tests
---

# TESTING.md

## Posture

- Reproducibility matters: randomness uses a fixed checked-in seed.
- Property-based tests encouraged for suitable pure logic.
- Unit tests are the baseline; integration tests are an extra layer and may overlap.
- "Obviously correct" helpers don't need tests.
- External-tool-dependent integration tests must skip gracefully when the tool is absent.

## Escalation order

host source-only -> host artifact-producing -> container (`act`) -> remote CI

- A check belongs at the first tier that can catch its failure class.
- Enter a tier only once the earlier ones pass.
- No check lives only inside the container tier when it can run on the host.
- `act` and remote CI run the same workflow files — one source of truth, so a local run is a real rehearsal.
- Every remote check `act` can run, it runs first — local iteration is far cheaper.
- Publishing and deploying are the sanctioned remote-only steps; keep them in a workflow or job an ordinary local run does not select.
- A check placed later than its cheapest tier states why at its definition site.

## Test-running policy

Use independent name markers in script names so risk classes are visible at the script-runner output. Common patterns:

- `*:integration` — long-running, noisy CI-parity checks. Safe.
- A dedicated marker for desktop-takeover tests (e.g. headed Electron/VS Code) — explicit consent only.
- A dedicated marker for tests depending on currently-published registry state — they can fail legitimately before upstream republish; explicit consent.

Rules:

- "All tests" excludes consent-required scripts.
- Non-scary scripts must not chain into scary ones — including through a CI job an `act` run targets.

## Build-script tests

Mirroring the build graph — script names, task wiring, workflow job shapes — is what lets these tests catch drift. The coupling is deliberate.

- Any change to build scripts, task wiring or intra-project build deps: read these tests and update them.
- A stale fixture that fails is harmless.
- A stale fixture that still passes — matching nothing, guarding nothing — is the failure to hunt for.

## Test conciseness

If you touch tests, look for conciseness wins unless that would hide intent.

- Remove repetition.
- Prefer tables/helpers when arrange/act/assert repeats.
- Keep `desc`/labels only when they add information.
- Derive titles from the sample or a small discriminator.
- Title states the asserted invariant, not the procedure.
- Use the smallest fixture that still proves the point.
- Shared fixture shapes become helpers.
- `test.each` / `describe.each` when it truly reduces duplication.

## Test helpers

- Unit-test files match a glob (e.g. `*.test.ts` under `src/test/`).
- Shared test helpers live alongside but must not match the test glob.
- Don't rely on a leading underscore to exclude helpers from the test runner; the glob is the real inclusion mechanism.

## Testing tools

Examples of established patterns:

- Vitest for unit tests.
- Mocha for Electron tests.
- `fast-check` via `@fast-check/vitest`.

When property-based-test primitives are unavailable in a given version, fall back to constructive primitives (`fc.mapToConstant(...)` + `fc.array(...)`, etc.).
