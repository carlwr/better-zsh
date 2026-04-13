# Development

## Reference markdown dumps

Use `pnpm dump:refs` to write the current static reference markdown under `.aux/refs/`.
This is for visual QA of zsh-core's rendered markdown corpus, including the subset consumed by VS Code hovers.

## zsh-core API docs

Use `pnpm docs:zsh-core` to build the local `zsh-core` API site under
`packages/zsh-core/.aux/docs/site/`.

Notes:

- The published docs site intentionally lives under `.aux/`, not `dist/`:
  `dist/` is packed for npm, so putting the site there risks silently shipping HTML/docs artifacts in package tarballs.
- `zsh-core` source uses explicit relative `.ts` import specifiers:
  this keeps native Deno/JSR source checks and publish dry-runs working from the source tree, not only from tsup output.
- Structured JSON artifacts are formatted directly by the build writer:
  keep formatting policy in generation code; avoid a separate post-process formatter stage for these outputs.
- Native JSR validation is available via `pnpm jsr:zsh-core:check`;
  this complements the package-oriented `pnpm jsr:zsh-core:dry`.

## Containerized integration tests

`pnpm test:integration` runs the `integration` workflow job through `act`.
Host requirements:

- `act`
- a Docker-compatible engine reachable via `docker`

The repo does not provide the container runtime; the host machine must.

### macOS

If a CLI-first setup is preferred, `colima` can be used.

```sh
# install and start:
brew install colima
colima start --disk 20

# to reset/restart:
colima stop
colima delete
colima start --disk 20

# to reclaim disk space from the VM disk:
docker system prune -af --volumes
colima ssh -- sudo fstrim -av

# note: tools may show colima VM disk as 100GB even though host disk use is less; prefer e.g. `du` to show actual usage:
du -h ~/.colima/_lima/_disks/colima/datadisk
```

On Apple Silicon, the wrapper defaults `act` to `linux/arm64` to match the local
runtime and avoid act's architecture warning. Use
`ACT_CONTAINER_ARCHITECTURE=linux/amd64` when GitHub-hosted Ubuntu fidelity
matters more than speed or local runtime stability.

### Headless Linux

Use Docker Engine or another Docker-compatible daemon reachable via `docker`.

### Notes

- First `act` run pulls runner images through Docker.
- The wrapper pins `ubuntu-latest` to act's documented medium runner image; set `ACT_RUNNER_IMAGE` to override that.
- Linux-only integration deps are installed inside the workflow container.
- Local `act` runs exercise the current worktree, including uncommitted changes.
- Direct Electron entrypoints remain available for explicit/manual use.
