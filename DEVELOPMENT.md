# Development

## Containerized integration tests

`pnpm test:integration` runs the `integration` workflow job through `act`.
Host requirements:

- `act`
- a Docker-compatible engine reachable via `docker`

The repo does not provide the container runtime; the host machine must.

### macOS

If a CLI-first setup is preferred, `colima` can be used. Once installed, use `colima start` to kick it off.

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
