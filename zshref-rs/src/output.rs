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
/// render those variants ourselves and print to stderr.
pub fn handle_clap_error(err: clap::Error, _cmd: &mut Command) -> i32 {
    match err.kind() {
        ErrorKind::DisplayHelp | ErrorKind::DisplayVersion => {
            // `err.render()` already carries the right help / version text
            // for the specific (sub)command that produced the error.
            eprint!("{}", err.render());
            0
        }
        ErrorKind::DisplayHelpOnMissingArgumentOrSubcommand => {
            eprint!("{}", err.render());
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
            let _ = err.print();
            2
        }
        _ => {
            let _ = err.print();
            1
        }
    }
}
