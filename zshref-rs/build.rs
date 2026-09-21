//! Data-source auto-detect for the embedded corpus.
//!
//! `src/corpus.rs` embeds JSONs via `include_bytes!`, which takes a literal
//! path, so the source is picked at compile time here — from
//! `ZSHREF_DATA_SOURCE` or what exists on disk — and handed over as:
//!
//! - `ZSHREF_INDEX_JSON`, `ZSHREF_RESOLVER_FIXTURE` — absolute paths, via `env!`
//! - `$OUT_DIR/file_bytes.rs` — the `(file, include_bytes!(…))` table for
//!   every `index.json.categories[].file`, so the record-file inventory has
//!   no hand-kept mirror
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
    println!(
        "cargo:rustc-env=ZSHREF_INDEX_JSON={}",
        source.index().display()
    );
    println!(
        "cargo:rustc-env=ZSHREF_RESOLVER_FIXTURE={}",
        source.fixture.display()
    );

    let out_dir: PathBuf = env::var_os("OUT_DIR").expect("OUT_DIR unset").into();
    fs::write(out_dir.join("file_bytes.rs"), file_bytes_table(source))
        .expect("write file_bytes.rs");
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

/// `&[("<file>", include_bytes!("<abs path>")), …]` over the category descriptors.
/// Paths go through `{:?}` so they land as valid string literals on every host.
fn file_bytes_table(source: &Source) -> String {
    #[derive(serde::Deserialize)]
    struct Versioned {
        version: u32,
    }
    #[derive(serde::Deserialize)]
    struct Category {
        file: String,
    }
    #[derive(serde::Deserialize)]
    struct Index {
        categories: Vec<Category>,
    }
    let index = source.index();
    let bytes = fs::read(&index).unwrap_or_else(|e| panic!("read {}: {e}", index.display()));
    let Versioned { version } =
        serde_json::from_slice(&bytes).unwrap_or_else(|e| panic!("parse {}: {e}", index.display()));
    assert_eq!(
        version,
        INDEX_VERSION,
        "{} is version {version}; this crate reads version {INDEX_VERSION} — re-vendor `data/` (DATA-SYNC.md)",
        index.display()
    );
    let Index { categories } =
        serde_json::from_slice(&bytes).unwrap_or_else(|e| panic!("parse {}: {e}", index.display()));
    let entries = categories.iter().map(|category| {
        let f = &category.file;
        let path = source.json_dir.join(f);
        let path = path
            .to_str()
            .unwrap_or_else(|| panic!("non-UTF-8 path {}", path.display()));
        format!("    ({f:?}, include_bytes!({path:?})),\n")
    });
    format!("&[\n{}]\n", entries.collect::<String>())
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
