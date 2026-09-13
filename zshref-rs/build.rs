//! Data-source auto-detect for the embedded corpus.
//!
//! `src/corpus.rs` embeds JSONs via `include_bytes!`, which takes a literal
//! path. The path is picked at compile time via `cfg(data_source = "...")`,
//! set here from what exists on disk:
//!
//!   ZSHREF_DATA_SOURCE=...              explicit override ("vendored"/"monorepo")
//!   zshref-rs/data/                     present → cfg(data_source="vendored")
//!   ../packages/.../artifacts/json/     present → cfg(data_source="monorepo")
//!   neither                             compile error with actionable message
//!
//! Post-extraction the monorepo branch is dead; drop it and everything
//! collapses to the vendored mode. Design: DATA-SYNC.md.

use std::{
    env,
    path::{Path, PathBuf},
};

fn main() {
    let manifest: PathBuf = env::var_os("CARGO_MANIFEST_DIR")
        .expect("CARGO_MANIFEST_DIR unset")
        .into();

    let vendored = manifest.join("data").join("index.json");
    let monorepo = manifest.join("../packages/zsh-core/artifacts/json/index.json");

    // Declare the custom cfg up-front so rustc doesn't warn on older
    // editions and check-cfg-aware compilers accept the two values.
    println!("cargo:rustc-check-cfg=cfg(data_source, values(\"vendored\", \"monorepo\"))");

    // Re-detect on the override changing (every make target sets it) or a
    // present candidate vanishing (`make vendor-clean`). A missing path
    // would re-run this script — and rebuild the crate — on every build, so
    // an appearing candidate is only seen through the override. The
    // embedded files themselves are tracked by rustc's dep-info.
    println!("cargo:rerun-if-env-changed=ZSHREF_DATA_SOURCE");
    for path in [&vendored, &monorepo].into_iter().filter(|p| p.exists()) {
        println!("cargo:rerun-if-changed={}", path.display());
    }
    let source = data_source(&manifest, &vendored, &monorepo);
    println!("cargo:rustc-cfg=data_source=\"{source}\"");
}

fn data_source(manifest: &Path, vendored: &Path, monorepo: &Path) -> &'static str {
    match env::var("ZSHREF_DATA_SOURCE") {
        Ok(s) if s == "vendored" => {
            if vendored.exists() {
                "vendored"
            } else {
                panic_with_help(manifest)
            }
        }
        Ok(s) if s == "monorepo" => {
            if monorepo.exists() {
                "monorepo"
            } else {
                panic_with_help(manifest)
            }
        }
        Ok(s) => panic!("ZSHREF_DATA_SOURCE must be vendored or monorepo, got {s:?}"),
        Err(_) if vendored.exists() => "vendored",
        Err(_) if monorepo.exists() => "monorepo",
        Err(_) => panic_with_help(manifest),
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
        monorepo = manifest
            .join("../packages/zsh-core/artifacts/json")
            .display(),
    );
}
