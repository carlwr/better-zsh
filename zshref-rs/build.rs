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
//! Post-extraction the monorepo branch is dead; drop it and everything
//! collapses to the vendored mode.

use sha2::{Digest, Sha256};
use std::{
    env, fs,
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
    println!(
        "cargo:rustc-env=ZSHREF_BUILD_INPUT_HASH={}",
        build_input_hash(&manifest, source)
    );
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

#[derive(Debug)]
struct HashEntry {
    label: String,
    path: PathBuf,
}

fn build_input_hash(manifest: &Path, source: &str) -> String {
    let manifest_file = manifest.join("build-inputs.txt");
    println!("cargo:rerun-if-changed={}", manifest_file.display());

    let mut entries = Vec::new();
    let spec = fs::read_to_string(&manifest_file).expect("read build-inputs.txt");
    for raw in spec.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.split_whitespace();
        match parts.next() {
            Some("file") => {
                let rel = parts.next().expect("file input needs path");
                let path = manifest.join(rel);
                add_file(&mut entries, rel.to_string(), path);
            }
            Some("rust-src") => {
                let rel = parts.next().expect("rust-src input needs dir");
                let dir = manifest.join(rel);
                println!("cargo:rerun-if-changed={}", dir.display());
                collect_rs(&dir, rel, &mut entries);
            }
            Some("json-data") => collect_json_data(manifest, source, &mut entries),
            Some(kind) => panic!("unknown build-inputs.txt entry kind: {kind}"),
            None => {}
        }
    }

    entries.sort_by(|a, b| a.label.cmp(&b.label));
    let mut h = Sha256::new();
    for e in entries {
        println!("cargo:rerun-if-changed={}", e.path.display());
        let bytes = fs::read(&e.path).unwrap_or_else(|err| {
            panic!("read build input {} ({}): {err}", e.label, e.path.display())
        });
        h.update(e.label.as_bytes());
        h.update([0]);
        h.update(bytes.len().to_string().as_bytes());
        h.update([0]);
        h.update(&bytes);
        h.update([0]);
    }
    format!("{:x}", h.finalize())
}

fn add_file(entries: &mut Vec<HashEntry>, label: String, path: PathBuf) {
    entries.push(HashEntry { label, path });
}

fn collect_rs(dir: &Path, rel: &str, entries: &mut Vec<HashEntry>) {
    let mut dirs = vec![(dir.to_path_buf(), rel.to_string())];
    while let Some((d, label_dir)) = dirs.pop() {
        for ent in fs::read_dir(&d)
            .unwrap_or_else(|err| panic!("read rust source dir {}: {err}", d.display()))
        {
            let ent = ent.expect("read rust source dir entry");
            let path = ent.path();
            let name = ent.file_name().to_string_lossy().into_owned();
            let label = format!("{label_dir}/{name}");
            if path.is_dir() {
                dirs.push((path, label));
            } else if path.extension().and_then(|s| s.to_str()) == Some("rs") {
                add_file(entries, label, path);
            }
        }
    }
}

fn collect_json_data(manifest: &Path, source: &str, entries: &mut Vec<HashEntry>) {
    match source {
        "vendored" => collect_json_dir(&manifest.join("data"), entries),
        "monorepo" => {
            collect_json_dir(&manifest.join("../packages/zsh-core/dist/json"), entries);
            add_file(
                entries,
                "json/tooldef.json".to_string(),
                manifest.join("../packages/zsh-core-tooldef/dist/json/tooldef.json"),
            );
        }
        other => panic!("unknown data source: {other}"),
    }
}

fn collect_json_dir(dir: &Path, entries: &mut Vec<HashEntry>) {
    println!("cargo:rerun-if-changed={}", dir.display());
    for ent in
        fs::read_dir(dir).unwrap_or_else(|err| panic!("read json dir {}: {err}", dir.display()))
    {
        let ent = ent.expect("read json dir entry");
        let path = ent.path();
        let name = ent.file_name().to_string_lossy().into_owned();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            add_file(entries, format!("json/{name}"), path);
        }
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
