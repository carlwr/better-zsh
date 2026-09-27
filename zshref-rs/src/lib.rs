//! Library target for the crate's binaries. No API stability: the crate
//! ships binaries, and this split exists so they share one code base.

pub mod cli;
pub mod corpus;
pub mod tools;

mod batch;
mod fuzzy;
mod index_version;
mod output;
mod resolver;

/// The project's home as the binaries' `--help` prints it, scheme-less: the
/// one Rust site a repo rename touches. A macro, not a `const`: `concat!`
/// takes literals only.
#[macro_export]
macro_rules! project_url {
    () => {
        "github.com/carlwr/zshref"
    };
}
