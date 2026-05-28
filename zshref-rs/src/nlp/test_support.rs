//! Shared compare-or-rewrite helper for generated JSON artifacts.

use std::path::Path;

/// Compares parsed JSON so committed-file formatting is irrelevant.
pub(crate) fn assert_committed_json(path: &Path, generated: &str, update_env: &str) {
    if std::env::var_os(update_env).is_some() {
        std::fs::write(path, generated).unwrap_or_else(|e| panic!("write {}: {e}", path.display()));
        return;
    }
    let committed = std::fs::read_to_string(path).unwrap_or_else(|e| {
        panic!(
            "read {} (run with {update_env}=1 to create): {e}",
            path.display()
        )
    });
    let want: serde_json::Value = serde_json::from_str(generated).expect("generated JSON parses");
    let got: serde_json::Value = serde_json::from_str(&committed)
        .unwrap_or_else(|e| panic!("parse {}: {e}", path.display()));
    assert_eq!(
        got,
        want,
        "{} drifted from the in-binary source of truth; rerun with {update_env}=1",
        path.display()
    );
}
