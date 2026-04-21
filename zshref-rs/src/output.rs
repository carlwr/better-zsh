//! Output routing: JSON → stdout, help/errors → stderr.
//!
//! Exit-code contract (mirrors `CLI-VISUAL-POLICY.md` and the existing TS
//! adapters):
//!   0 — success, including `{match:null}` and empty-match results
//!   1 — unexpected internal error
//!   2 — invalid input (bad flag, enum, missing required, unknown subcommand)

use clap::error::ErrorKind;
use clap::Command;
use serde_json::Value;
use std::io::{IsTerminal, Write};

/// Write `value` as pretty JSON to stdout (2-space indent, trailing newline).
pub fn emit(value: &Value) {
    let s = serde_json::to_string_pretty(value).unwrap_or_else(|_| "null".to_string());
    println!("{s}");
}

/// Translate a clap error into an exit code and route output to the correct
/// stream. `DisplayHelp` / `DisplayVersion` are exit-0 informational; user
/// errors map to 2; everything else maps to 1.
///
/// Stream routing: clap sends `DisplayHelp` / `DisplayVersion` to stdout by
/// default. CLI-VISUAL-POLICY.md reserves stdout for JSON results, so we
/// render those variants ourselves and print to stderr. Styling is preserved
/// via `StyledStr::ansi()` when stderr is a TTY + color isn't suppressed;
/// the clap-internal `Display` impl strips ANSI, so `err.render()` formatted
/// with `{}` would lose all bold/underline/color.
pub fn handle_clap_error(err: clap::Error, _cmd: &mut Command) -> i32 {
    match err.kind() {
        ErrorKind::DisplayHelp | ErrorKind::DisplayVersion => {
            write_to_stderr(&err);
            0
        }
        ErrorKind::DisplayHelpOnMissingArgumentOrSubcommand => {
            write_to_stderr(&err);
            2
        }
        ErrorKind::InvalidValue
        | ErrorKind::UnknownArgument
        | ErrorKind::InvalidSubcommand
        | ErrorKind::NoEquals
        | ErrorKind::ValueValidation
        | ErrorKind::TooManyValues
        | ErrorKind::TooFewValues
        | ErrorKind::WrongNumberOfValues
        | ErrorKind::ArgumentConflict
        | ErrorKind::MissingRequiredArgument
        | ErrorKind::MissingSubcommand => {
            // For non-help errors, clap's own `err.print()` goes to stderr
            // with `anstream::AutoStream`, which already handles TTY + the
            // `NO_COLOR` env var correctly. Use it.
            let _ = err.print();
            2
        }
        _ => {
            let _ = err.print();
            1
        }
    }
}

/// Render the help- / version-flag message to stderr, preserving ANSI styling
/// when stderr is a TTY and color isn't suppressed.
fn write_to_stderr(err: &clap::Error) {
    let rendered = err.render();
    let mut stderr = std::io::stderr().lock();
    let _ = if stderr_wants_color() {
        write!(stderr, "{}", rendered.ansi())
    } else {
        write!(stderr, "{rendered}")
    };
}

/// Treat `NOCOLOR` as an alias for `NO_COLOR` (documented in the root help).
/// Idempotent: if `NO_COLOR` is already set, or `NOCOLOR` is empty / unset,
/// this does nothing. Must run before clap / anstream read the environment.
pub fn normalize_nocolor_env() {
    if std::env::var_os("NO_COLOR")
        .map(|v| !v.is_empty())
        .unwrap_or(false)
    {
        return;
    }
    if let Some(val) = std::env::var_os("NOCOLOR") {
        if !val.is_empty() {
            // SAFETY: single-threaded at startup (before `run()` spawns any
            // threads). set_var is unsafe on Rust 2024 edition; we're on
            // 2021, but documenting the invariant here for future edition
            // bumps.
            std::env::set_var("NO_COLOR", val);
        }
    }
}

/// Local copy of the stream-gating logic used for help/version messages.
/// Mirrors `anstream::AutoStream::choice(&std::io::stderr())`:
/// honor `NO_COLOR` unconditionally, then fall back to TTY detection.
fn stderr_wants_color() -> bool {
    if std::env::var_os("NO_COLOR")
        .map(|v| !v.is_empty())
        .unwrap_or(false)
    {
        return false;
    }
    std::io::stderr().is_terminal()
}
