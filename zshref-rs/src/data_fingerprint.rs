//! Content fingerprint of the binary's embedded data inputs.
//!
//! One implementation, two callers that must hash identically:
//! - `build.rs` bakes it into `ZSHREF_BUILD_INPUT_HASH` (also driving cargo's
//!   `rerun-if-changed`).
//! - the runtime `_selfcheck --check-build-fresh` gate recomputes and compares
//!   (semantics in `nlp::selfcheck::check_build_fresh`).
//!
//! Pure (no `env!`/`cfg!`/cargo directives) so `build.rs` can `#[path]`-mod it
//! without the runtime glue.

use sha2::{Digest, Sha256};
use std::io;
use std::path::{Path, PathBuf};

pub struct Entry {
    pub label: String,
    pub path: PathBuf,
}

/// Hashed file inputs plus the directories whose listing defines them.
pub struct Collected {
    pub entries: Vec<Entry>,
    /// `build.rs` watches these for `rerun-if-changed` (catch added/removed
    /// files); the runtime check only hashes `entries`.
    #[allow(dead_code)]
    pub watch_dirs: Vec<PathBuf>,
}

/// Inputs from `build-inputs.txt` for the active `source` (`"monorepo"` |
/// `"vendored"`), sorted by label so the hash is walk-order-independent. IO
/// errors propagate; a malformed spec panics (committed, build-validated).
pub fn collect(manifest: &Path, source: &str) -> io::Result<Collected> {
    let mut entries = Vec::new();
    let mut watch_dirs = Vec::new();
    let spec = std::fs::read_to_string(manifest.join("build-inputs.txt"))?;
    for raw in spec.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.split_whitespace();
        match parts.next() {
            Some("file") => {
                let rel = parts.next().expect("file input needs path");
                entries.push(Entry {
                    label: rel.to_string(),
                    path: manifest.join(rel),
                });
            }
            Some("rust-src") => {
                let rel = parts.next().expect("rust-src input needs dir");
                let dir = manifest.join(rel);
                watch_dirs.push(dir.clone());
                collect_rs(&dir, rel, &mut entries)?;
            }
            Some("json-data") => {
                collect_json_data(manifest, source, &mut entries, &mut watch_dirs)?;
            }
            Some(kind) => panic!("unknown build-inputs.txt entry kind: {kind}"),
            None => {}
        }
    }
    entries.sort_by(|a, b| a.label.cmp(&b.label));
    Ok(Collected {
        entries,
        watch_dirs,
    })
}

/// SHA-256 over `label \0 len \0 bytes \0` per entry, in `entries` order.
pub fn hash(entries: &[Entry]) -> io::Result<String> {
    let mut h = Sha256::new();
    for e in entries {
        let bytes = std::fs::read(&e.path)?;
        h.update(e.label.as_bytes());
        h.update([0]);
        h.update(bytes.len().to_string().as_bytes());
        h.update([0]);
        h.update(&bytes);
        h.update([0]);
    }
    Ok(format!("{:x}", h.finalize()))
}

fn collect_rs(dir: &Path, rel: &str, entries: &mut Vec<Entry>) -> io::Result<()> {
    let mut dirs = vec![(dir.to_path_buf(), rel.to_string())];
    while let Some((d, label_dir)) = dirs.pop() {
        for ent in std::fs::read_dir(&d)? {
            let ent = ent?;
            let path = ent.path();
            let name = ent.file_name().to_string_lossy().into_owned();
            let label = format!("{label_dir}/{name}");
            if path.is_dir() {
                dirs.push((path, label));
            } else if path.extension().and_then(|s| s.to_str()) == Some("rs") {
                entries.push(Entry { label, path });
            }
        }
    }
    Ok(())
}

fn collect_json_data(
    manifest: &Path,
    source: &str,
    entries: &mut Vec<Entry>,
    watch_dirs: &mut Vec<PathBuf>,
) -> io::Result<()> {
    match source {
        "vendored" => collect_json_dir(&manifest.join("data"), entries, watch_dirs),
        "monorepo" => {
            collect_json_dir(
                &manifest.join("../packages/zsh-core/dist/json"),
                entries,
                watch_dirs,
            )?;
            entries.push(Entry {
                label: "json/tooldef.json".to_string(),
                path: manifest.join("../packages/zsh-core-tooldef/dist/json/tooldef.json"),
            });
            Ok(())
        }
        other => panic!("unknown data source: {other}"),
    }
}

fn collect_json_dir(
    dir: &Path,
    entries: &mut Vec<Entry>,
    watch_dirs: &mut Vec<PathBuf>,
) -> io::Result<()> {
    watch_dirs.push(dir.to_path_buf());
    for ent in std::fs::read_dir(dir)? {
        let ent = ent?;
        let path = ent.path();
        let name = ent.file_name().to_string_lossy().into_owned();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            entries.push(Entry {
                label: format!("json/{name}"),
                path,
            });
        }
    }
    Ok(())
}
