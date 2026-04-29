//! Output routing: JSON → stdout, help/errors → stderr.
//!
//! Exit-code contract (mirrors `CLI-VISUAL-POLICY.md` and the existing TS
//! adapters):
//!   0 — success, including empty-match (`matches: []`) results
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
/// render those variants to stderr ourselves — preserving ANSI via
/// `StyledStr::ansi()` when color is wanted (clap's own `Display` strips
/// ANSI, so `"{err}"` loses all styling).
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
            // through `anstream::AutoStream` — already gated correctly on
            // NO_COLOR / CLICOLOR_FORCE / TTY.
            let _ = err.print();
            2
        }
        _ => {
            let _ = err.print();
            1
        }
    }
}

fn write_to_stderr(err: &clap::Error) {
    let rendered = err.render();
    let mut stderr = std::io::stderr().lock();
    let _ = if stderr_wants_color() {
        write!(stderr, "{}", rendered.ansi())
    } else {
        write!(stderr, "{rendered}")
    };
}

/// Mirror the gating `anstream::AutoStream` applies to stderr:
///   NO_COLOR (non-empty)   → never
///   CLICOLOR_FORCE ("1"…)  → always
///   otherwise              → `stderr.is_terminal()`
fn stderr_wants_color() -> bool {
    if env_nonempty("NO_COLOR") {
        return false;
    }
    if env_nonempty("CLICOLOR_FORCE") {
        return true;
    }
    std::io::stderr().is_terminal()
}

fn env_nonempty(key: &str) -> bool {
    std::env::var_os(key)
        .map(|v| !v.is_empty())
        .unwrap_or(false)
}
