//! The tool layer neither executes anything nor reads the environment or
//! the file system: `src/tools.rs` and everything under `src/tools/` must
//! not name those std facilities. Loosening this is a product decision,
//! not an implementation detail.

use std::fs;
use std::path::{Path, PathBuf};

const FORBIDDEN: &[&str] = &[
    "std::process",
    "std::net",
    "std::env",
    "std::fs",
    "std::io",
    "Command::new",
    "env::var",
];

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(dir).expect("read tools dir") {
        let path = entry.expect("dir entry").path();
        if path.is_dir() {
            rust_files(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

#[test]
fn tool_sources_name_no_process_env_or_fs_facility() {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = vec![src.join("tools.rs")];
    rust_files(&src.join("tools"), &mut files);
    assert!(files.len() > 1, "no tool sources found");
    let violations: Vec<String> = files
        .iter()
        .flat_map(|file| {
            let text = fs::read_to_string(file).expect("read source");
            FORBIDDEN
                .iter()
                .filter(|needle| text.contains(*needle))
                .map(|needle| format!("{}: {needle}", file.display()))
                .collect::<Vec<_>>()
        })
        .collect();
    assert!(violations.is_empty(), "{}", violations.join("\n"));
}
