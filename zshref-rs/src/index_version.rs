//! The `index.json` shape this crate reads: `JsonIndex.version` in zsh-core.
//! One constant for `build.rs` (which fails a stale data source at compile
//! time) and `corpus.rs` (which re-checks the embedded bytes).

pub const INDEX_VERSION: u32 = 7;
