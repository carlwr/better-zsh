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

/// Compact JSON (single line + `\n`) by default; `--pretty` → indented.
/// `batch` never calls this — it writes its own compact lines per request.
pub fn emit(value: &Value, pretty: bool) {
    print!("{}", render(value, pretty));
}

/// Always emit indented JSON.
pub fn emit_pretty(value: &Value) {
    print!("{}", render(value, true));
}

/// Render JSON exactly as `emit` writes it to stdout.
pub fn render(value: &Value, pretty: bool) -> String {
    let s = if pretty {
        serde_json::to_string_pretty(value)
    } else {
        serde_json::to_string(value)
    }
    .unwrap_or_else(|_| "null".to_string());
    format!("{s}\n")
}

/// Translate a clap error to an exit code, routing output to the right stream.
/// `DisplayHelp`/`DisplayVersion` → stderr (stdout is reserved for JSON per
/// CLI-VISUAL-POLICY.md), rendered with ANSI via `StyledStr::ansi()` so
/// styling isn't lost (clap's `Display` strips ANSI). User errors → 2;
/// internal errors → 1.
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
            // `err.print()` routes through `anstream::AutoStream` — color
            // gating on NO_COLOR / CLICOLOR_FORCE / TTY is already correct.
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
