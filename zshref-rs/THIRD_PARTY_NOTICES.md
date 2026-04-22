This file lists crates linked into the compiled `zshref` binary. Build-time
tooling (rustc, cargo) is not covered here. Vendored zsh upstream documentation
notices are in the repo-root `THIRD_PARTY_NOTICES.md`.

To regenerate (when versions change): `cargo install cargo-about && cargo about
generate about.hbs` — or update this file by hand for now.

---

## MIT OR Apache-2.0

- anstream 1.0.0
- anstyle 1.0.14
- anstyle-parse 1.0.0
- anstyle-query 1.1.5
- anstyle-wincon 3.0.11
- anyhow 1.0.102
- bitflags 2.11.1
- clap 4.6.1
- clap_builder 4.6.0
- clap_complete 4.6.2
- clap_lex 1.1.0
- colorchoice 1.0.5
- equivalent 1.0.2
- errno 0.3.14
- hashbrown 0.17.0
- indexmap 2.14.0
- is_terminal_polyfill 1.70.2
- itoa 1.0.18
- libc 0.2.185
- once_cell_polyfill 1.70.2
- proc-macro2 1.0.106
- quote 1.0.45
- serde 1.0.228
- serde_core 1.0.228
- serde_derive 1.0.228
- serde_json 1.0.149
- syn 2.0.117
- terminal_size 0.4.4
- utf8parse 0.2.2
- windows-link 0.2.1
- windows-sys 0.61.2

## MIT

- strsim 0.11.1
- zmij 1.0.21

## Unlicense OR MIT

- memchr 2.8.0

## Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT

- linux-raw-sys 0.12.1
- rustix 1.1.4

## (MIT OR Apache-2.0) AND Unicode-3.0

- unicode-ident 1.0.24
