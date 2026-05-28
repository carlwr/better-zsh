//! Cross-cuts on the `nlp` Cargo feature: both build configurations must
//! advertise the right surface.
//!
//! - default (`zshref`): `nlp-search` subcommand omitted; `batch` returns a
//!   `{"ok": false, ...}` for `nlp_search` with a recoverable message.
//! - `--features nlp` (`zshref-nlp`): `nlp-search` registered in `--help`;
//!   the internal `_selfcheck` verb is registered but hidden from `--help`.

mod common;

use common::BIN;
use std::process::Command;
#[cfg(not(feature = "nlp"))]
use std::{io::Write, process::Stdio};

#[cfg(not(feature = "nlp"))]
#[test]
fn default_build_omits_nlp_search_subcommand() {
    let out = Command::new(BIN)
        .arg("--help")
        .output()
        .expect("spawn zshref");
    let stdout = String::from_utf8(out.stdout).expect("utf-8");
    assert!(
        !stdout.contains("nlp-search"),
        "default --help mentions nlp-search; subcommand should be feature-gated:\n{stdout}"
    );
}

#[cfg(feature = "nlp")]
#[test]
fn nlp_build_registers_nlp_search_subcommand() {
    let out = Command::new(BIN)
        .arg("--help")
        .output()
        .expect("spawn zshref");
    let stdout = String::from_utf8(out.stdout).expect("utf-8");
    assert!(
        stdout.contains("nlp-search"),
        "nlp build --help missing nlp-search subcommand:\n{stdout}"
    );
}

#[cfg(feature = "nlp")]
#[test]
fn nlp_build_hides_selfcheck_from_help() {
    // Internal verb; must not surface in `--help`. (No completions assertion:
    // that omission is structural + not integration-tested per policy — see
    // pretty_anywhere.rs.)
    let out = Command::new(BIN)
        .arg("--help")
        .output()
        .expect("spawn zshref");
    let stdout = String::from_utf8(out.stdout).expect("utf-8");
    assert!(
        !stdout.contains("_selfcheck"),
        "nlp build --help leaks the internal _selfcheck subcommand:\n{stdout}"
    );
}

#[cfg(not(feature = "nlp"))]
#[test]
fn default_build_batch_rejects_nlp_search_with_clear_message() {
    let mut child = Command::new(BIN)
        .arg("batch")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn zshref batch");
    {
        let mut stdin = child.stdin.take().expect("stdin");
        writeln!(
            stdin,
            r#"{{"tool":"nlp_search","input":{{"query":"anything"}}}}"#
        )
        .expect("write stdin");
    }
    let out = child.wait_with_output().expect("wait");
    assert!(out.status.success(), "batch exit nonzero: {:?}", out.status);
    let stdout = String::from_utf8(out.stdout).expect("utf-8");
    assert!(
        stdout.contains(r#""ok":false"#),
        "expected per-request error envelope:\n{stdout}"
    );
    assert!(
        stdout.contains("nlp"),
        "expected error message to mention nlp:\n{stdout}"
    );
}
