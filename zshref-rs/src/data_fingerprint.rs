//! Content fingerprint of the binary's data inputs.
//!
//! `build.rs` bakes it into `ZSHREF_BUILD_INPUT_HASH` (also driving cargo's
//! `rerun-if-changed`); the TS mirror in the tooldef parity suite recomputes
//! it over the same inputs to detect a stale binary.
//!
//! Pure at module scope (no `env!`/`cfg!`/cargo directives outside
//! `#[cfg(test)]`) so `build.rs` can `#[path]`-mod it. The crate compiles it
//! under `cfg(test)` only, for the guard below — hence the crate-side
//! `dead_code` allowance on what only `build.rs` calls.
#![allow(dead_code)]

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
    /// files); only `entries` are hashed.
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
            Some("src-tree") => {
                let rel = parts.next().expect("src-tree input needs dir");
                let exts: Vec<&str> = parts.collect();
                assert!(!exts.is_empty(), "src-tree input needs extensions");
                let dir = manifest.join(rel);
                watch_dirs.push(dir.clone());
                collect_src_tree(&dir, rel, &exts, &mut entries)?;
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

/// Suffix-matched on the file name rather than `Path::extension`: the latter
/// reports `None` for a file named exactly `.rs`, where the TS mirror's
/// `endsWith` accepts it. Symlinks are followed, as `include_str!` follows them.
fn has_ext(name: &str, exts: &[&str]) -> bool {
    exts.iter().any(|ext| name.ends_with(&format!(".{ext}")))
}

fn collect_src_tree(
    dir: &Path,
    rel: &str,
    exts: &[&str],
    entries: &mut Vec<Entry>,
) -> io::Result<()> {
    let mut dirs = vec![(dir.to_path_buf(), rel.to_string())];
    while let Some((d, label_dir)) = dirs.pop() {
        for ent in std::fs::read_dir(&d)? {
            let ent = ent?;
            let path = ent.path();
            let name = ent.file_name().to_string_lossy().into_owned();
            let label = format!("{label_dir}/{name}");
            if path.is_dir() {
                dirs.push((path, label));
            } else if has_ext(&name, exts) {
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
                &manifest.join("../packages/zsh-core/artifacts/json"),
                entries,
                watch_dirs,
            )?;
            entries.push(Entry {
                label: "json/tooldef.json".to_string(),
                path: manifest.join("../packages/zsh-core-tooldef/artifacts/json/tooldef.json"),
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
        if has_ext(&name, &["json"]) {
            entries.push(Entry {
                label: format!("json/{name}"),
                path,
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use regex::Regex;
    use std::collections::BTreeSet;

    /// Macros standing in for a literal path. They expand to a `concat!`
    /// reaching the JSON corpus, which the `json-data` input already covers.
    const PATH_MACROS: [&str; 2] = ["corpus_path", "tooldef_path"];

    /// Captures a literal argument, else the name of the macro supplying one.
    /// The alternation means this pattern cannot match its own source text —
    /// it lives inside the tree it scans. Prose mentions carry no `(`.
    const INCLUDE_RE: &str = r#"include_(?:str|bytes)!\s*\(\s*(?:"([^"]*)"|([A-Za-z0-9_]+)!)"#;

    /// Every asset compiled into the binary must also be fingerprinted, or
    /// editing it changes the binary while its build-input hash — and so the
    /// staleness verdict of the parity suite — stays put.
    #[test]
    fn every_embedded_asset_is_fingerprinted() {
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        let spec = std::fs::read_to_string(manifest.join("build-inputs.txt"))
            .expect("read build-inputs.txt");

        let mut covered = BTreeSet::new();
        let mut roots = Vec::new();
        for raw in spec.lines() {
            let mut parts = raw.split_whitespace();
            if parts.next() != Some("src-tree") {
                continue;
            }
            let rel = parts.next().expect("src-tree input needs dir");
            let exts: Vec<&str> = parts.collect();
            let dir = manifest.join(rel);
            let mut entries = Vec::new();
            collect_src_tree(&dir, rel, &exts, &mut entries).expect("walk src tree");
            for e in entries {
                covered.insert(e.path.canonicalize().expect("canonicalize input"));
            }
            roots.push(dir);
        }
        assert!(
            !roots.is_empty(),
            "build-inputs.txt declares no src-tree input"
        );

        let re = Regex::new(INCLUDE_RE).expect("valid include pattern");
        let mut sources = Vec::new();
        for dir in &roots {
            collect_src_tree(dir, ".", &["rs"], &mut sources).expect("walk sources");
        }
        for src in &sources {
            let text = std::fs::read_to_string(&src.path).expect("read source");
            let dir = src.path.parent().expect("source has a parent");
            for cap in re.captures_iter(&text) {
                if let Some(lit) = cap.get(1) {
                    let path = dir.join(lit.as_str()).canonicalize().unwrap_or_else(|e| {
                        panic!("embedded {} in {}: {e}", lit.as_str(), src.path.display())
                    });
                    assert!(
                        covered.contains(&path),
                        "embedded asset is not a build-fingerprint input: {} (from {}) \
                         — add its extension to build-inputs.txt",
                        path.display(),
                        src.path.display(),
                    );
                } else if let Some(mac) = cap.get(2) {
                    assert!(
                        PATH_MACROS.contains(&mac.as_str()),
                        "unrecognised path macro `{}!` in {} — a non-literal include is \
                         invisible to this guard; confirm the asset is fingerprinted",
                        mac.as_str(),
                        src.path.display(),
                    );
                }
            }
        }
    }
}
