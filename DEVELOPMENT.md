# Development

Repo-level notes; package detail lives in each package.

## zsh-lexicon

- `pnpm dump:refs` — the rendered lexicon as markdown, for visual QA; workflow: `packages/zsh-lexicon/AGENTS.md`
- `pnpm docs:zsh-lexicon` — builds the API site (as deployed to GitHub Pages) into `packages/zsh-lexicon/.aux/docs/site/`

### Changes to the release assets

`zshref-rs/` embeds zsh-lexicon's JSON artifacts and tests its resolver mirror against the conformance fixture beside them. Any change to those artifacts — taxonomy, record fields, resolver behaviour — is cross-language.

A resolver change the mirror does not follow fails `make cli-test`. How the artifacts reach the crate: `zshref-rs/DATA-SYNC.md`.

## Integration tests via `act`

The extension's `test:integration` runs the `integration` CI job through `act` (`scripts/test-integration-act`). Release workflows rehearse the same way, as dry-run dispatches; each header names its entry point.

Host requirements:
- `act`
- a Docker-compatible engine reachable via `docker`

The repo does not provide the container runtime.

### macOS

If a CLI-first setup is preferred, `colima` works. Its default VM (2 CPUs, 2 GiB) is too small for the `nlp` job — the index build peaks above 2 GB and is OOM-killed (exit 137) — so size it at creation.

- flags stick to the instance; `colima stop` + `colima start` with new values resizes it
- exception: the Docker data disk never shrinks and survives `colima delete`; `--data` drops it
- disk images are sparse: `du` shows real use; Finder and `ls -l` show nominal size

```sh
brew install colima
colima start --disk 20 --memory 6 --cpu 4

# reset
colima stop
colima delete --data
colima start --disk 20 --memory 6 --cpu 4

# reclaim VM-backed disk space
docker system prune -af
docker volume prune -af  # named volumes too, e.g. act's
colima ssh -- sh -c 'sync && sudo fstrim -av'
du -sh ~/.colima
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
