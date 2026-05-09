//! Output routing: JSON/help/version → stdout, errors → stderr.
//!
//! Exit-code contract mirrors the CLI policy document and the existing TS
//! adapters.

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
/// `DisplayHelp`/`DisplayVersion` → stdout (explicit help/version request);
/// implicit bad-input help stays on stderr. Display output uses
/// `StyledStr::ansi()` when color is enabled so styling isn't lost
/// (clap's `Display` strips ANSI). User errors → 2; internal errors → 1.
pub fn handle_clap_error(err: clap::Error, _cmd: &mut Command) -> i32 {
    match err.kind() {
        ErrorKind::DisplayHelp | ErrorKind::DisplayVersion => {
            write_to_stdout(&err);
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

fn write_to_stdout(err: &clap::Error) {
    let rendered = err.render();
    let mut stdout = std::io::stdout().lock();
    let _ = if stdout_wants_color() {
        write!(stdout, "{}", rendered.ansi())
    } else {
        write!(stdout, "{rendered}")
    };
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

/// Mirror the relevant `anstream::AutoStream` color gates:
///   NO_COLOR (non-empty)          → never
///   CLICOLOR_FORCE (non-0 value)  → always
///   otherwise                     → destination stream `.is_terminal()`
fn stdout_wants_color() -> bool {
    stream_wants_color(std::io::stdout().is_terminal())
}

fn stderr_wants_color() -> bool {
    stream_wants_color(std::io::stderr().is_terminal())
}

fn stream_wants_color(is_terminal: bool) -> bool {
    if env_nonempty("NO_COLOR") {
        return false;
    }
    if env_force_color() {
        return true;
    }
    is_terminal
}

fn env_nonempty(key: &str) -> bool {
    std::env::var_os(key)
        .map(|v| !v.is_empty())
        .unwrap_or(false)
}

fn env_force_color() -> bool {
    std::env::var_os("CLICOLOR_FORCE")
        .map(|v| !v.is_empty() && v.to_string_lossy() != "0")
        .unwrap_or(false)
}
