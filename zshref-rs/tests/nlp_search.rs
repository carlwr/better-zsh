#![cfg(feature = "nlp")]

use std::path::PathBuf;
use std::process::{Command, Output};

const BIN: &str = env!("CARGO_BIN_EXE_zshref");

// The write-capable path fails before touching the index path.
fn missing_paths() -> (PathBuf, PathBuf) {
    let root = std::env::temp_dir().join(format!("zshref-nlp-missing-{}", std::process::id()));
    (root.join("model"), root.join("index.json"))
}

fn nlp_search(args: &[&str]) -> Output {
    Command::new(BIN)
        .arg("nlp-search")
        .args(args)
        .output()
        .expect("spawn zshref")
}

fn selfcheck(args: &[&str]) -> Output {
    Command::new(BIN)
        .arg("_selfcheck")
        .args(args)
        .output()
        .expect("spawn zshref")
}

fn stderr(out: &Output) -> String {
    String::from_utf8(out.stderr.clone()).expect("stderr is utf-8")
}

#[test]
fn rebuild_with_missing_model_is_actionable() {
    let (model_dir, index_path) = missing_paths();
    let out = nlp_search(&[
        "--rebuild-index",
        "--model-dir",
        &model_dir.display().to_string(),
        "--index",
        &index_path.display().to_string(),
        "compare files by when they changed",
    ]);
    assert_eq!(out.status.code(), Some(1));
    assert!(out.stdout.is_empty());
    let err = stderr(&out);
    assert!(err.contains("missing local model file"), "{err}");
    assert!(err.contains(&model_dir.display().to_string()), "{err}");
}

#[test]
fn search_with_missing_index_points_at_rebuild() {
    let (model_dir, index_path) = missing_paths();
    let out = nlp_search(&[
        "--model-dir",
        &model_dir.display().to_string(),
        "--index",
        &index_path.display().to_string(),
        "compare files by when they changed",
    ]);
    assert_eq!(out.status.code(), Some(1));
    assert!(out.stdout.is_empty());
    let err = stderr(&out);
    assert!(err.contains("nlp index not found"), "{err}");
    assert!(err.contains("--rebuild-index"), "{err}");
}

#[test]
fn selfcheck_validate_index_loads_no_model() {
    let (_model_dir, index_path) = missing_paths();
    let out = selfcheck(&[
        "--validate-index",
        "--index",
        &index_path.display().to_string(),
    ]);
    assert_eq!(out.status.code(), Some(1));
    let err = stderr(&out);
    assert!(!err.contains("missing local model file"), "{err}");
    assert!(err.contains(&index_path.display().to_string()), "{err}");
}

#[test]
fn selfcheck_check_build_fresh_passes_for_freshly_built_binary() {
    let out = selfcheck(&["--check-build-fresh"]);
    assert_eq!(out.status.code(), Some(0), "{}", stderr(&out));
    let stdout = String::from_utf8(out.stdout).expect("stdout is utf-8");
    assert!(stdout.contains("checkBuildFresh"), "{stdout}");
}

#[test]
fn selfcheck_emit_rules_writes_json_without_model() {
    let dir = std::env::temp_dir().join(format!("zshref-emit-{}", std::process::id()));
    let out = selfcheck(&["--emit-rules", "--out", &dir.display().to_string()]);
    assert_eq!(out.status.code(), Some(0), "{}", stderr(&out));
    let tuning = std::fs::read_to_string(dir.join("tuning.json")).expect("tuning emitted");
    assert!(tuning.contains("\"category\""), "{tuning}");
    let _ = std::fs::remove_dir_all(&dir);
}
