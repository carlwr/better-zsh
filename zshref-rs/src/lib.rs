//! `zshref` is a binary crate: the `zshref` CLI and, behind feature `mcp`,
//! the `zshref-mcp` server; usage in the README.
//!
//! The library target is internal: it lets the binaries and tests share code.
//! Not a supported API; no semver guarantees. Its items are `doc(hidden)`.

#[doc(hidden)]
pub mod cli;
#[doc(hidden)]
pub mod corpus;
#[doc(hidden)]
pub mod tools;

mod batch;
mod fuzzy;
mod index_version;
mod output;
mod resolver;

/// The project's home as the binaries' `--help` prints it, scheme-less: the
/// one Rust site a repo rename touches. A macro, not a `const`: `concat!`
/// takes literals only.
#[doc(hidden)]
#[macro_export]
macro_rules! project_url {
    () => {
        "github.com/carlwr/zshref"
    };
}
