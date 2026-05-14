use std::process::Command;

const BIN: &str = env!("CARGO_BIN_EXE_zshref");

#[test]
fn tool_help_examples_match_cli_output() {
    for sub in ["docs", "search", "list"] {
        let help = help_for(sub);
        let (command, shown_output) = extract_example(&help, sub);
        let actual = run_example_command(command);
        assert_eq!(
            shown_output, actual,
            "`zshref {sub} --help` example drifted from real CLI output"
        );
    }
}

fn help_for(sub: &str) -> String {
    let out = Command::new(BIN)
        .args([sub, "--help"])
        .env("NO_COLOR", "1")
        .output()
        .unwrap_or_else(|e| panic!("spawn zshref {sub} --help: {e}"));
    assert!(out.status.success(), "zshref {sub} --help failed: {out:?}");
    assert!(
        out.stderr.is_empty(),
        "zshref {sub} --help wrote stderr:\n{}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).expect("help is utf-8")
}

fn extract_example(help: &str, sub: &str) -> (String, String) {
    let lines = help.lines().collect::<Vec<_>>();
    let idx = lines
        .iter()
        .position(|line| *line == "Example:")
        .unwrap_or_else(|| panic!("zshref {sub} --help has no Example section:\n{help}"));
    let prompt_idx = lines[idx + 1..]
        .iter()
        .position(|line| !line.is_empty())
        .map(|offset| idx + 1 + offset)
        .unwrap_or_else(|| panic!("zshref {sub} --help Example has no command:\n{help}"));
    let prompt = lines
        .get(prompt_idx)
        .expect("prompt_idx is derived from existing lines");
    let command = prompt
        .strip_prefix("    $ ")
        .or_else(|| prompt.strip_prefix("  $ "))
        .unwrap_or_else(|| panic!("bad Example prompt line in zshref {sub} --help: {prompt:?}"));
    let mut out = String::new();
    for line in &lines[prompt_idx + 1..] {
        if line.is_empty() {
            continue;
        }
        // Stop at the first non-indented non-empty line: that's prose after the
        // Example block (batch --help has an Error response shape: section).
        let Some(body) = line
            .strip_prefix("    ")
            .or_else(|| line.strip_prefix("  "))
        else {
            break;
        };
        out.push_str(body);
        out.push('\n');
    }
    (command.to_string(), out)
}

#[test]
fn batch_help_example_matches_real_output() {
    let help = help_for("batch");
    let (command, shown_output) = extract_example(&help, "batch");
    let request = parse_batch_pipeline(&command);
    let actual = run_batch_request(&request);
    assert_eq!(
        shown_output, actual,
        "`zshref batch --help` example drifted from real CLI output"
    );
}

fn parse_batch_pipeline(command: &str) -> String {
    let suffix = " | zshref batch";
    let head = command
        .strip_suffix(suffix)
        .unwrap_or_else(|| panic!("batch example must end with `{suffix}`: {command:?}"));
    let request = head
        .strip_prefix("echo '")
        .and_then(|s| s.strip_suffix('\''))
        .unwrap_or_else(|| {
            panic!("batch example must wrap request in `echo '<json>'`: {command:?}")
        });
    request.to_string()
}

fn run_batch_request(request: &str) -> String {
    use std::io::Write;
    use std::process::Stdio;
    let mut child = Command::new(BIN)
        .arg("batch")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("NO_COLOR", "1")
        .spawn()
        .expect("spawn zshref batch");
    // Stdin write on its own thread so wait_with_output can drain stdout
    // concurrently — see src/batch.rs:5 for the rationale.
    let mut stdin_h = child.stdin.take().expect("stdin piped");
    let payload = format!("{request}\n");
    let writer = std::thread::spawn(move || {
        stdin_h
            .write_all(payload.as_bytes())
            .expect("write batch stdin");
    });
    let out = child.wait_with_output().expect("wait batch");
    writer.join().expect("stdin writer panicked");
    assert!(out.status.success(), "zshref batch failed: {out:?}");
    assert!(
        out.stderr.is_empty(),
        "zshref batch wrote stderr:\n{}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).expect("batch stdout is utf-8")
}

fn run_example_command(command: String) -> String {
    let args = command
        .strip_prefix("zshref ")
        .unwrap_or_else(|| panic!("example command must start with `zshref `: {command}"))
        .split(' ')
        .collect::<Vec<_>>();
    let out = Command::new(BIN)
        .args(args)
        .env("NO_COLOR", "1")
        .output()
        .unwrap_or_else(|e| panic!("spawn example `{command}`: {e}"));
    assert!(out.status.success(), "example `{command}` failed: {out:?}");
    assert!(
        out.stderr.is_empty(),
        "example `{command}` wrote stderr:\n{}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).expect("example stdout is utf-8")
}
