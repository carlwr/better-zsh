//! Data-source auto-detect for the embedded corpus.
//!
//! `src/corpus.rs` embeds JSONs via `include_bytes!`, which takes a literal
//! path, so the source is picked at compile time here — from
//! `ZSHREF_DATA_SOURCE` or what exists on disk — and handed over as absolute
//! paths via `env!`: `ZSHREF_INDEX_JSON`, `ZSHREF_RECORDS_JSON`,
//! `ZSHREF_RESOLVER_FIXTURE`.
//!
//! `index.json.version` is checked here first, so a stale data source fails
//! the build with the re-vendor hint rather than on whichever field moved.
//!
//! Design: DATA-SYNC.md.

use std::{
    env, fs,
    path::{Path, PathBuf},
};

#[path = "src/index_version.rs"]
mod index_version;
use index_version::INDEX_VERSION;

/// Where one data source keeps the corpus JSONs and the resolver fixture.
struct Source {
    name: &'static str,
    json_dir: PathBuf,
    fixture: PathBuf,
}

impl Source {
    fn index(&self) -> PathBuf {
        self.json_dir.join("index.json")
    }
    fn records(&self) -> PathBuf {
        self.json_dir.join("records.json")
    }
}

fn main() {
    let manifest: PathBuf = env::var_os("CARGO_MANIFEST_DIR")
        .expect("CARGO_MANIFEST_DIR unset")
        .into();

    let vendored = Source {
        name: "vendored",
        json_dir: manifest.join("data"),
        fixture: manifest.join("data/resolver-fixture.json"),
    };
    let monorepo = Source {
        name: "monorepo",
        json_dir: manifest.join("../packages/zsh-core/artifacts/json"),
        fixture: manifest
            .join("../packages/zsh-core/artifacts/resolver-fixture/resolver-fixture.json"),
    };

    // Re-detect on the override changing or a present
    // candidate vanishing (`make vendor-clean`). A missing path
    // would re-run this script — and rebuild the crate — on every build, so
    // an appearing candidate is only seen through the override. The
    // embedded files themselves are tracked by rustc's dep-info.
    println!("cargo:rerun-if-env-changed=ZSHREF_DATA_SOURCE");
    for path in [vendored.index(), monorepo.index()]
        .iter()
        .filter(|p| p.exists())
    {
        println!("cargo:rerun-if-changed={}", path.display());
    }
    let source = data_source(&manifest, &vendored, &monorepo);
    check_version(&source.index());
    println!(
        "cargo:rustc-env=ZSHREF_INDEX_JSON={}",
        source.index().display()
    );
    println!(
        "cargo:rustc-env=ZSHREF_RECORDS_JSON={}",
        source.records().display()
    );
    println!(
        "cargo:rustc-env=ZSHREF_RESOLVER_FIXTURE={}",
        source.fixture.display()
    );
}

fn data_source<'s>(manifest: &Path, vendored: &'s Source, monorepo: &'s Source) -> &'s Source {
    match env::var("ZSHREF_DATA_SOURCE") {
        Ok(s) if s == vendored.name => {
            if vendored.index().exists() {
                vendored
            } else {
                panic_with_help(manifest)
            }
        }
        Ok(s) if s == monorepo.name => {
            if monorepo.index().exists() {
                monorepo
            } else {
                panic_with_help(manifest)
            }
        }
        Ok(s) => panic!("ZSHREF_DATA_SOURCE must be vendored or monorepo, got {s:?}"),
        Err(_) if vendored.index().exists() => vendored,
        Err(_) if monorepo.index().exists() => monorepo,
        Err(_) => panic_with_help(manifest),
    }
}

fn check_version(index: &Path) {
    #[derive(serde::Deserialize)]
    struct Versioned {
        version: u32,
    }
    let bytes = fs::read(index).unwrap_or_else(|e| panic!("read {}: {e}", index.display()));
    let Versioned { version } =
        serde_json::from_slice(&bytes).unwrap_or_else(|e| panic!("parse {}: {e}", index.display()));
    assert_eq!(
        version,
        INDEX_VERSION,
        "{} is version {version}; this crate reads version {INDEX_VERSION} — re-vendor `data/` (DATA-SYNC.md)",
        index.display()
    );
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
