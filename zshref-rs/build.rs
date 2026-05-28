//! Data-source auto-detect + semantic build fingerprint for embedded data.
//!
//! See DATA-SYNC.md for the full design rationale. Short version:
//! `src/corpus.rs` embeds JSONs via `include_bytes!`, which takes a literal
//! path. We pick the path at compile time via `cfg(data_source = "...")`,
//! set here based on what exists on disk:
//!
//!   ZSHREF_DATA_SOURCE=...          explicit override ("vendored"/"monorepo")
//!   zshref-rs/data/                  present → cfg(data_source="vendored")
//!   ../packages/.../dist/json/       present → cfg(data_source="monorepo")
//!   neither                          compile error with actionable message
//!
//! The data fingerprint (`ZSHREF_BUILD_INPUT_HASH`) comes from the shared
//! `src/data_fingerprint.rs` (also used by the runtime freshness check).
//!
//! Post-extraction the monorepo branch is dead; drop it and everything
//! collapses to the vendored mode.

#[path = "src/data_fingerprint.rs"]
mod data_fingerprint;

use std::{
    env,
    path::{Path, PathBuf},
};

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

    println!("cargo:rerun-if-env-changed=ZSHREF_DATA_SOURCE");
    let source = data_source(&manifest, &vendored, &monorepo_core, &monorepo_tooldef);

    println!("cargo:rustc-cfg=data_source=\"{source}\"");

    // Fingerprint the data inputs; watch each file + its defining dirs so
    // added/removed files re-trigger the build.
    println!(
        "cargo:rerun-if-changed={}",
        manifest.join("build-inputs.txt").display()
    );
    let collected = data_fingerprint::collect(&manifest, source)
        .unwrap_or_else(|e| panic!("collect build inputs: {e}"));
    for dir in &collected.watch_dirs {
        println!("cargo:rerun-if-changed={}", dir.display());
    }
    for entry in &collected.entries {
        println!("cargo:rerun-if-changed={}", entry.path.display());
    }
    let hash = data_fingerprint::hash(&collected.entries)
        .unwrap_or_else(|e| panic!("hash build inputs: {e}"));
    println!("cargo:rustc-env=ZSHREF_BUILD_INPUT_HASH={hash}");
}

fn data_source(
    manifest: &Path,
    vendored: &Path,
    monorepo_core: &Path,
    monorepo_tooldef: &Path,
) -> &'static str {
    match env::var("ZSHREF_DATA_SOURCE") {
        Ok(s) if s == "vendored" => {
            if vendored.exists() {
                "vendored"
            } else {
                panic_with_help(manifest)
            }
        }
        Ok(s) if s == "monorepo" => {
            if monorepo_core.exists() && monorepo_tooldef.exists() {
                "monorepo"
            } else {
                panic_with_help(manifest)
            }
        }
        Ok(s) => panic!("ZSHREF_DATA_SOURCE must be vendored or monorepo, got {s:?}"),
        Err(_) if vendored.exists() => "vendored",
        Err(_) if monorepo_core.exists() && monorepo_tooldef.exists() => "monorepo",
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
        monorepo = manifest.join("../packages/zsh-core/dist/json").display(),
    );
}
