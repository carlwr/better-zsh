//! MSRV drift guard: no resolved dependency may require a newer Rust than the
//! floor declared for the build configuration that pulls it in.
//!
//! CI builds on `dtolnay/rust-toolchain@stable` with no MSRV job, so an
//! understated floor is invisible there — it surfaces only when a user on the
//! declared version tries to build. Two floors, because cargo has no
//! per-feature MSRV: `rust-version` covers the default build,
//! `[package.metadata.msrv] all-features` the every-feature build (`nlp`
//! pulls `ort`, which floors higher).
//!
//! Both read `cargo metadata`, which needs no network while `Cargo.lock` is
//! current, and compare numerically (`1.9` outranks `1.85` lexically, but not
//! as a version). Default-features tests, so `make cli-test` gates them.
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

fn metadata(triple: &str, features: &[&str]) -> serde_json::Value {
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
        .args(features)
        .output()
        .expect("spawn cargo metadata");
    assert!(
        out.status.success(),
        "cargo metadata failed for {triple}:\n{}",
        String::from_utf8_lossy(&out.stderr)
    );
    serde_json::from_slice(&out.stdout).expect("cargo metadata json")
}

/// Every package resolved under `features`, across [`TRIPLES`], whose
/// `rust_version` exceeds `floor` — one line each, ready for a failure list.
/// A package that offends on only some triples is tagged with them; one that
/// offends everywhere is not, since the tag would carry no information.
fn over_floor(features: &[&str], floor: &str) -> Vec<String> {
    let mut by_pkg: BTreeMap<String, Vec<&str>> = BTreeMap::new();
    for triple in TRIPLES {
        let meta = metadata(triple, features);
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

/// `decl` names the Cargo.toml key holding `floor`, so a failure points at the
/// knob to turn.
fn assert_fits(decl: &str, features: &[&str], floor: &str) {
    let over = over_floor(features, floor);
    assert!(
        over.is_empty(),
        "`{decl}` declares Rust {floor}, but resolved packages need newer:\n  {}\n\
         Fix: raise `{decl}` in zshref-rs/Cargo.toml (keep its floor comment in \
         sync), or pin the dependency back.",
        over.join("\n  ")
    );
}

#[test]
fn default_build_fits_declared_rust_version() {
    assert_fits("rust-version", &[], env!("CARGO_PKG_RUST_VERSION"));
}

#[test]
fn all_features_build_fits_declared_floor() {
    let meta = metadata(TRIPLES[0], &["--all-features"]);
    let root = meta["packages"]
        .as_array()
        .expect("metadata.packages")
        .iter()
        .find(|p| p["name"] == env!("CARGO_PKG_NAME"))
        .expect("root package in metadata");
    let floor = root["metadata"]["msrv"]["all-features"]
        .as_str()
        .expect("[package.metadata.msrv] all-features missing from Cargo.toml")
        .to_string();

    assert_fits(
        "package.metadata.msrv.all-features",
        &["--all-features"],
        &floor,
    );
}
