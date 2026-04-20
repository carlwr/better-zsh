# Development

Repo-level notes that do not fit better in a package-local `DEVELOPMENT.md`.

## Reference markdown dumps

Use `pnpm dump:refs` to write the current static reference markdown under `.aux/refs/`.
This is visual QA for zsh-core's rendered reference corpus, including the subset consumed by VS Code hovers.

## zsh-core API docs

Use `pnpm docs:zsh-core` to build the local `zsh-core` API site under `packages/zsh-core/.aux/docs/site/`.

Notes:
- The published docs site intentionally lives under `.aux/`, not `dist/`; `dist/` is packed for npm.
- `zsh-core` source uses explicit relative `.ts` import specifiers so native Deno/JSR checks work from source, not only from bundled output.
- Structured JSON artifacts are formatted by the build writer itself; keep formatting policy in generation code rather than a post-process step.
- Native JSR validation is available via `pnpm jsrREGISTRY:zsh-core:check`; it complements `pnpm jsrREGISTRY:zsh-core:dry`.

## Integration tests via `act`

The workspace `pnpm test:integration` command delegates to per-package `test:integration` scripts. At the repo level, the containerized case that usually matters is the extension package, whose `test:integration` runs the `integration` workflow job through `act`.

Host requirements:
- `act`
- a Docker-compatible engine reachable via `docker`

The repo does not provide the container runtime.

### macOS

If a CLI-first setup is preferred, `colima` works:

```sh
brew install colima
colima start --disk 20

# restart / reset
colima stop
colima delete
colima start --disk 20

# reclaim VM-backed disk space
docker system prune -af --volumes
colima ssh -- sudo fstrim -av
du -h ~/.colima/_lima/_disks/colima/datadisk
```

On Apple Silicon, the wrapper defaults `act` to `linux/arm64` to match the local runtime and avoid act's architecture warning. Use `ACT_CONTAINER_ARCHITECTURE=linux/amd64` when GitHub-hosted Ubuntu fidelity matters more than speed or local stability.

### Headless Linux

Use Docker Engine or another Docker-compatible daemon reachable via `docker`.

### Notes

- The first `act` run pulls runner images through Docker.
- The wrapper pins `ubuntu-latest` to act's documented medium runner image; set `ACT_RUNNER_IMAGE` to override that.
- Linux-only integration dependencies are installed inside the workflow container.
- Local `act` runs exercise the current worktree, including uncommitted changes.
- Direct Electron entrypoints remain available for explicit manual use.
