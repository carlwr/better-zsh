//! Data-source auto-detect for the embedded JSON corpus.
//!
//! See DATA-SYNC.md for the full design rationale. Short version:
//! `src/corpus.rs` embeds JSONs via `include_bytes!`, which takes a literal
//! path. We pick the path at compile time via `cfg(data_source = "...")`,
//! set here based on what exists on disk:
//!
//!   zshref-rs/data/                  present → cfg(data_source="vendored")
//!   ../packages/.../dist/json/       present → cfg(data_source="monorepo")
//!   neither                          compile error with actionable message
//!
//! Post-extraction the monorepo branch is dead; drop it and everything
//! collapses to the vendored mode.

use std::{env, path::Path, path::PathBuf};

fn main() {
    let manifest: PathBuf = env::var_os("CARGO_MANIFEST_DIR")
        .expect("CARGO_MANIFEST_DIR unset")
        .into();

    let vendored = manifest.join("data").join("index.json");
    let monorepo_core = manifest.join("../packages/zsh-core/dist/json/index.json");
    let monorepo_tooldef = manifest.join("../packages/zsh-core-tooldef/dist/json/tooldef.json");

    // Declare the custom cfg up-front so rustc doesn't warn on older
    // editions and check-cfg-aware compilers accept the two values.
    println!("cargo:rustc-check-cfg=cfg(data_source, values(\"vendored\", \"monorepo\"))");

    let source = if vendored.exists() {
        "vendored"
    } else if monorepo_core.exists() && monorepo_tooldef.exists() {
        "monorepo"
    } else {
        panic_with_help(&manifest);
    };

    println!("cargo:rustc-cfg=data_source=\"{source}\"");

    // Force a rebuild when any candidate source changes. `rerun-if-changed`
    // on a missing path is a no-op, so listing both is safe.
    for p in [
        manifest.join("data"),
        manifest.join("../packages/zsh-core/dist/json"),
        manifest.join("../packages/zsh-core-tooldef/dist/json"),
    ] {
        println!("cargo:rerun-if-changed={}", p.display());
    }
}

fn panic_with_help(manifest: &Path) -> ! {
    panic!(
        "\nzshref: no data source found. Expected one of:\n\
           - {vendored} (vendored mode; run `make vendor` from the repo root)\n\
           - {monorepo} (monorepo mode; run `make cli` from the repo root)\n\
         \n\
         See zshref-rs/DATA-SYNC.md for the full design.\n",
        vendored = manifest.join("data").display(),
        monorepo = manifest.join("../packages/zsh-core/dist/json").display(),
    );
}
