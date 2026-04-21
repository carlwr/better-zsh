//! Shared-fixture parity test: for every fixture under
//! `tests/fixtures/<tool>/<case>.json`, spawn the built `zshref` binary
//! with the stored argv and compare its stdout JSON to the stored
//! `expectedOutput`. Fixtures are produced by the TS side's
//! `rust-fixtures.test.ts` when invoked with `BZ_WRITE_RUST_FIXTURES=1`.
//!
//! Score fields are stripped before comparison: fuzzysort (TS) and
//! nucleo-matcher (Rust) use different scoring scales, so we assert on
//! ranking + identity fields only.

use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const BIN: &str = env!("CARGO_BIN_EXE_zshref");

#[derive(serde::Deserialize)]
struct Fixture {
    #[allow(dead_code)]
    tool: String,
    argv: Vec<String>,
    #[serde(rename = "expectedOutput")]
    expected_output: Value,
}

fn strip_scores(v: Value) -> Value {
    match v {
        Value::Array(arr) => Value::Array(arr.into_iter().map(strip_scores).collect()),
        Value::Object(obj) => {
            let mut out = Map::new();
            for (k, val) in obj {
                if k == "score" {
                    continue;
                }
                out.insert(k, strip_scores(val));
            }
            Value::Object(out)
        }
        other => other,
    }
}

fn collect_fixtures(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            collect_fixtures(&p, out);
        } else if p.extension().and_then(|s| s.to_str()) == Some("json") {
            out.push(p);
        }
    }
}

#[test]
fn fixtures_match_rust_cli_output() {
    let fixture_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    let mut paths = Vec::new();
    collect_fixtures(&fixture_root, &mut paths);
    paths.sort();
    assert!(
        !paths.is_empty(),
        "no fixtures found under {}; run `BZ_WRITE_RUST_FIXTURES=1 pnpm --filter @carlwr/zsh-core-tooldef test rust-fixtures` to generate them",
        fixture_root.display()
    );

    let mut failures: Vec<String> = Vec::new();
    for path in &paths {
        let fixture: Fixture = serde_json::from_slice(
            &fs::read(path).unwrap_or_else(|e| panic!("read {}: {e}", path.display())),
        )
        .unwrap_or_else(|e| panic!("parse {}: {e}", path.display()));

        let output = Command::new(BIN)
            .args(&fixture.argv)
            .output()
            .unwrap_or_else(|e| panic!("spawn {BIN}: {e}"));

        if !output.status.success() {
            failures.push(format!(
                "{}: exit {:?}\nargv: {:?}\nstderr:\n{}",
                path.display(),
                output.status.code(),
                fixture.argv,
                String::from_utf8_lossy(&output.stderr),
            ));
            continue;
        }

        let actual: Value = match serde_json::from_slice(&output.stdout) {
            Ok(v) => v,
            Err(e) => {
                failures.push(format!(
                    "{}: stdout is not valid JSON ({e}):\n{}",
                    path.display(),
                    String::from_utf8_lossy(&output.stdout),
                ));
                continue;
            }
        };

        let actual = strip_scores(actual);
        let expected = strip_scores(fixture.expected_output);
        if actual != expected {
            failures.push(format!(
                "{}: mismatch\nargv: {:?}\nexpected:\n{}\nactual:\n{}",
                path.display(),
                fixture.argv,
                serde_json::to_string_pretty(&expected).unwrap_or_default(),
                serde_json::to_string_pretty(&actual).unwrap_or_default(),
            ));
        }
    }

    if !failures.is_empty() {
        panic!(
            "{} fixture mismatch(es):\n\n{}",
            failures.len(),
            failures.join("\n\n---\n\n"),
        );
    }
}
