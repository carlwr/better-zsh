# Resolver conformance fixture

Companion to `README.md` (rules for this dir, working rules, end state). Everything about this step lives here; the README section is a pointer.

_Status: executed._

zsh-core emits a fixture — per category, resolver inputs with the expected id and feedback — as a second release asset next to the corpus JSON; `zshref-rs` vendors it beside the corpus and tests `resolver.rs` against it. Replaces tooldef's `parity.test.ts` as the behavioural check of the one mirror that outlives the reorg.

## Scope

- fixture: `packages/zsh-core/scripts/resolver-fixture.ts` → `artifacts/resolver-fixture/resolver-fixture.json` + its schema; types in `src/docs/json-types.ts` (`ResolverFixtureJson`)
- release: `pack-json.ts` → `pack-release.ts` (`pack:release`), one asset table, both tarballs verified unpacked, `dataHash` equal across assets; `release-zsh-core.yml` attests and uploads by glob
- Rust: `make vendor` copies the fixture to `data/`; `resolver_fixture_path()` beside the `corpus_path!` macros selects by the same `cfg(data_source)`; `#[cfg(test)]` in `src/resolver.rs` replays every case through `resolve_in`
- the known `resolveRedir` gap fixed TS-side (`matchRedirKey`: longest `groupOp` prefix wins, tail disambiguates within); parity gains `>&`, `<&`, `<&file` cases
- covers the zsh-core-only mirror unit `resolver`; `record-fields` is a data contract already exercised by loading the corpus — no fixture
- lands while tooldef's `parity.test.ts` still runs: both green on the same pinned cases before the old harness goes
- untouched: `parity-units.ts`, `mirror-pairs.test.ts`, the markers on both sides (the tooldef step re-judges them); `zshref info` (`dataHash` there is the tooldef step's)

## Decisions

- _what is pinned:_ `lookupRaw` + `resolverFeedback` per input, `null` where absent — `resolve_in` is the Rust equivalent, and `lookupRaw` is the sanctioned combination (`DESIGN.md`)
- _truth:_ the fixture records what TS answers at emit time; TS correctness stays with zsh-core's resolver tests
- _inputs:_ pinned (resolver tests, parity cases, JSDoc examples) ∪ cross-category tokens fed to every category ∪ generated per record (id, display, and per-category surface forms: sigils, wrapping parens, negation, redirection operands); deduped, first-seen order, no randomness
  - generation deviates from `id` + `display` through a `Partial` override table materialised over `docCategories`; a redirection sig with an unknown tail word fails the build
- _domain:_ printable ASCII, one line — asserted at emit; Unicode whitespace and line terminators have no right answer to pin across a JS regex and Rust `char` methods
- _emitter home:_ `scripts/`, not `src/` — `deno.json` publishes `src/**/*.ts`, and a build-only module would ship to JSR unexported
- _Rust test shape:_ in-crate, direct `resolve_in` — no envelope, no docs-tool history filter; survives the later `lib.rs`
- _fixture ships in the `.crate`:_ the crate ships its tests (`include` has `tests/**/*.rs`), so it ships their input; `cargo test` from a downloaded crate stays green. PACKAGING.md's release-asset rule constrains the producer's registry payload (zsh-core's npm/JSR tarball — untouched)
- _vendored `buildInputHash`_ now covers the fixture and no longer equals monorepo mode's for the same TS build; accepted — the parity suite runs against a monorepo-mode binary, and the hash goes with tooldef
- _the redirection gap:_ zsh lexes the longest operator, so Rust was right; TS adopts the rule rather than Rust adopting the fallback
- _`mirror-pairs.test.ts` one-sided successor:_ none — the fixture test is the behavioural successor for the resolver unit; the markers stay as comments

### Decided during execution

- the fixture schema lives beside the fixture (`artifacts/resolver-fixture/`), not under `artifacts/schema/` — the JSON asset copies that dir whole, and each asset should be self-contained
- `@minItems 1` on the per-category case list, honoured by the schema generator; the pack verify relies on the schema for "every category present and non-empty" instead of a second loop
- the emitter throws on a non-ASCII input rather than a test asserting the domain: the build cannot ship a fixture outside it
- the sentence eval was run before/after the fix (model and index present): only the `redirection` row moves, 0.755 → 0.761
- hand-conceived edge not chased, recorded as a follow-up: `history_expn` caret shorthand with text after the final `^` (`^a^b^:G`, `^a^^`) — Rust `history_key` answers `!!`, TS's regex answers nothing; neither generated nor pinned

## Captures

`.aux/resolver-fixture/` (gitignored):

- `capture <label>`: `zshref batch` over tooldef's pinned parity cases (`pinned.jsonl`) + `dump-help`; `before/`, `after-s2/`, `after-s3/` — equal
- `mismatches-before-fix.txt`: the Rust listing with the generated inputs, before the TS fix — bare `>&` and `<&` only (4218 cases)
- `fixture-generated-{before,after}-fix.json`, `fixture-diff-fix.txt`: the fixture diff across the fix — those two inputs plus the family's added pinned/cross inputs
- `eval-sentence-{before,after}.txt`

## Gates

Green at every commit:

```sh
pnpm format && pnpm qa && pnpm --filter @carlwr/zsh-core test:pack && pnpm test:scripts
make cli-check && make cli-test && make cli-vendored-test && make cli-package
make cli && BZ_REQUIRE_PARITY=1 pnpm --filter @carlwr/zsh-core-tooldef test parity
```

## Follow-ups

- the caret-shorthand edge above: `man zshexpn` — `^foo^bar^` is `!!:s^foo^bar^` and other modifiers may follow the final `^` (`^foo^bar^:G`), so the Rust answer looks right; pin, align TS
- with tooldef gone (next steps), `parity.test.ts`'s redirection cases go with it; the fixture already carries them
