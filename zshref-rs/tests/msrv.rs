//! MSRV drift guard: no resolved dependency may require a newer Rust than the
//! declared `rust-version`.
//!
//! CI builds on `dtolnay/rust-toolchain@stable` with no MSRV job, so an
//! understated floor is invisible there — it surfaces only when a user on the
//! declared version tries to build.
//!
//! Reads `cargo metadata`, which needs no network while `Cargo.lock` is
//! current, and compares numerically (`1.9` outranks `1.85` lexically, but not
//! as a version). `make cli-test` gates it.
//! Resolution is filtered per release-relevant triple: unfiltered metadata
//! drags in wasm/wasi-only packages nothing here ever compiles, while a
//! host-only filter would make the verdict differ per machine.

use std::collections::BTreeMap;
use std::process::Command;

/// Target triples the graph is resolved under. `--filter-platform` only
/// evaluates `cfg`, so none of them has to be an installed target.
const TRIPLES: &[&str] = &[
    "aarch64-apple-darwin",
    "x86_64-unknown-linux-gnu",
    "x86_64-pc-windows-msvc",
];

/// `1.85` / `1.56.1` -> numerically comparable triple.
fn ver(s: &str) -> (u32, u32, u32) {
    let mut it = s.split('.').map(|p| p.parse().unwrap_or(0));
    let mut next = || it.next().unwrap_or(0);
    (next(), next(), next())
}

fn metadata(triple: &str) -> serde_json::Value {
    let out = Command::new(env!("CARGO"))
        .args([
            "metadata",
            "--format-version",
            "1",
            "--manifest-path",
            concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.toml"),
            "--filter-platform",
            triple,
        ])
        .output()
        .expect("spawn cargo metadata");
    assert!(
        out.status.success(),
        "cargo metadata failed for {triple}:\n{}",
        String::from_utf8_lossy(&out.stderr)
    );
    serde_json::from_slice(&out.stdout).expect("cargo metadata json")
}

/// Every package resolved across [`TRIPLES`] whose `rust_version` exceeds
/// `floor` — one line each, ready for a failure list.
/// A package that offends on only some triples is tagged with them; one that
/// offends everywhere is not, since the tag would carry no information.
fn over_floor(floor: &str) -> Vec<String> {
    let mut by_pkg: BTreeMap<String, Vec<&str>> = BTreeMap::new();
    for triple in TRIPLES {
        let meta = metadata(triple);
        for p in meta["packages"].as_array().expect("metadata.packages") {
            let Some(req) = p["rust_version"].as_str() else {
                continue;
            };
            if ver(req) > ver(floor) {
                let name = p["name"].as_str().unwrap_or("?");
                let version = p["version"].as_str().unwrap_or("?");
                let line = format!("{name} {version} requires Rust {req}");
                by_pkg.entry(line).or_default().push(triple);
            }
        }
    }
    by_pkg
        .into_iter()
        .map(|(line, triples)| match triples.len() == TRIPLES.len() {
            true => line,
            false => format!("{line} [{}]", triples.join(", ")),
        })
        .collect()
}

#[test]
fn default_build_fits_declared_rust_version() {
    let floor = env!("CARGO_PKG_RUST_VERSION");
    let over = over_floor(floor);
    assert!(
        over.is_empty(),
        "`rust-version` declares Rust {floor}, but resolved packages need newer:\n  {}\n\
         Fix: raise `rust-version` in zshref-rs/Cargo.toml (keep its floor comment in \
         sync), or pin the dependency back.",
        over.join("\n  ")
    );
}
