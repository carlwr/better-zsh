---
audience: maintainer
read-when: making zsh-core generated JSON artifacts available as tarball GitHub release assets
---

The intention is to, at some point in time but for the 1.0 release at latest, make the `zsh-core` generated JSON artifacts available as tarball GitHub release assets.

"Generated JSON artifacts" means roughly the corpus data as JSON and its JSON-schema.


## Considerations

remove the generated JSON artifacts from the `@carlwr/zsh-core` package released on npm/JSR?
* note yet decided/determined; some notes on for/against below (not exhaustive)
* reasons to _not include_:
  * JSON is a projection of the corpus for non-TS consumers; TS/JS consumers use the typed API
  * reduces package weight
* reasons to _include_:
  * TS/JS consumers may still have reasons to want to use the JSON artifacts
  * convenience for some to make the JSON artifacts also available in versioned form through the npm and jsr registries? (consumers needing them can have them as deps rather than vendoring them)

versioning
- share the `zsh-core` version or not?
- "corpus data version"?
- JSON artifacts expected to change much less than the `zsh-core` public API
- notions of "version(s)" used across the subprojects?
- automatic CI-administret content-gated corpus versioning?
- _derived_ or _authored_ version?
- tag shape?
- _conceptual_ space of distinct versions:
  - `zsh-core` package version
  - zsh upstream version (version of the vendored upstream Yodl files)
  - artifacts: corpus data version (the emitted JSON bytes)
  - artifacts: envelope version (JSON schema shape)

other to-be separate-repo subprojects that use these JSON artifacts should probably (?) transition to getting them through the _Github release artifacts_ route, from when this is added.
* since: exercises the Github artifacts mechanism; is how it would be post-extraction/post-release

choices should probably be done so it is consistent across sub-projects (i.e. for/if any other subproject have generated artifacts)

Generated artifacts as a separate npm/JSR package?
- probably _no_: would add manifest, build, test, notice, and CI overhead
