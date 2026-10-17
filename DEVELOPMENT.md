# Development

Repo-level notes; package detail lives in each package.

## zsh-core

- `pnpm dump:refs` — the rendered reference corpus as markdown, for visual QA; workflow: `packages/zsh-core/AGENTS.md`
- `pnpm docs:zsh-core` — builds the API site (as deployed to GitHub Pages) into `packages/zsh-core/.aux/docs/site/`

### Changes to the release assets

`zshref-rs/` embeds zsh-core's JSON artifacts and tests its resolver mirror against the conformance fixture beside them. Any change to those artifacts — taxonomy, record fields, resolver behaviour — is cross-language.

A resolver change the mirror does not follow fails `make cli-test`. How the artifacts reach the crate: `zshref-rs/DATA-SYNC.md`.

## Integration tests via `act`

The extension's `test:integration` runs the `integration` CI job through `act` (`scripts/test-integration-act`).

Host requirements:
- `act`
- a Docker-compatible engine reachable via `docker`

The repo does not provide the container runtime.

### macOS

If a CLI-first setup is preferred, `colima` works. Its default VM (2 CPUs, 2 GiB) is too small for the `nlp` job — the index build peaks above 2 GB and is OOM-killed (exit 137) — so size it at creation; the flags stick to the instance, and `colima stop` + `colima start` with new values resizes an existing one.

```sh
brew install colima
colima start --disk 20 --memory 6 --cpu 4

# restart / reset
colima stop
colima delete
colima start --disk 20 --memory 6 --cpu 4

# reclaim VM-backed disk space
docker system prune -af --volumes
colima ssh -- sudo fstrim -av
du -h ~/.colima/_lima/_disks/colima/datadisk
```

### Headless Linux

Use Docker Engine or another Docker-compatible daemon reachable via `docker`.

### Notes

- The first `act` run pulls runner images through Docker.
- `act` runs its own cache server, so `actions/cache` steps store and restore across local runs — host-side, under `~/.cache/actcache`. Nothing expires there; `rm -rf ~/.cache/actcache` reclaims it.
- Knobs (`ACT_*`) and their defaults: `scripts/test-integration-act`.
- Linux-only integration dependencies are installed inside the workflow container.
- Local `act` runs exercise the current worktree, including uncommitted changes.
- Direct Electron entrypoints remain available for explicit manual use.
