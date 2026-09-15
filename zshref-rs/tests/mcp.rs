//! Black-box client over the `zshref-mcp` binary: one stdio session per test,
//! JSON-RPC frames written by hand and responses matched by id. Every
//! successful `tools/call` is checked for `structuredContent` == the parsed
//! text block and validated against the tool's `outputSchema`.

mod common;

use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use zshref::tools::text::Target;
use zshref::tools::ToolName;

const BIN: &str = env!("CARGO_BIN_EXE_zshref-mcp");

struct Session {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
    /// Responses read while waiting for another id.
    received: BTreeMap<u64, Value>,
    initialize: Value,
}

impl Session {
    fn start() -> Self {
        let mut child = Command::new(BIN)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("spawn zshref-mcp");
        let stdin = child.stdin.take().expect("stdin");
        let stdout = BufReader::new(child.stdout.take().expect("stdout"));
        let mut session = Self {
            child,
            stdin,
            stdout,
            next_id: 1,
            received: BTreeMap::new(),
            initialize: Value::Null,
        };
        session.initialize = session.request(
            "initialize",
            json!({
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": { "name": "zshref-mcp-test", "version": "0" },
            }),
        );
        session.write(&json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }));
        session
    }

    fn write(&mut self, frame: &Value) {
        writeln!(self.stdin, "{frame}").expect("write frame");
    }

    /// Write a request; the response is collected later by `response`.
    fn send(&mut self, method: &str, params: Value) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        self.write(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }));
        id
    }

    /// The response to `id`, reading frames until it arrives; a response
    /// must carry `result`.
    fn response(&mut self, id: u64) -> Value {
        while !self.received.contains_key(&id) {
            let mut line = String::new();
            let n = self.stdout.read_line(&mut line).expect("read frame");
            assert!(n > 0, "server closed stdout before responding to id {id}");
            let msg: Value = serde_json::from_str(&line).expect("frame is JSON");
            let Some(got) = msg["id"].as_u64() else {
                continue;
            };
            assert!(
                msg.get("error").is_none(),
                "JSON-RPC error for id {got}: {}",
                msg["error"]
            );
            self.received.insert(got, msg["result"].clone());
        }
        self.received.remove(&id).expect("present")
    }

    fn request(&mut self, method: &str, params: Value) -> Value {
        let id = self.send(method, params);
        self.response(id)
    }

    fn call(&mut self, tool: &str, args: Value) -> Value {
        let result = self.request("tools/call", json!({ "name": tool, "arguments": args }));
        check_call_result(tool, &result);
        result
    }

    /// Close stdin; the server must exit 0 with nothing on stderr.
    fn finish(mut self) {
        drop(self.stdin);
        let mut rest = String::new();
        self.stdout.read_to_string(&mut rest).expect("drain stdout");
        let out = self.child.wait_with_output().expect("wait");
        assert!(out.status.success(), "exit {:?}", out.status.code());
        assert!(
            out.stderr.is_empty(),
            "stderr:\n{}",
            String::from_utf8_lossy(&out.stderr)
        );
    }
}

/// The success invariant of every call: a text block that parses to the
/// `structuredContent`, which conforms to the tool's `outputSchema`.
fn check_call_result(tool: &str, result: &Value) {
    if result["isError"].as_bool().unwrap_or(false) {
        assert!(
            result.get("structuredContent").is_none(),
            "error result carries structuredContent: {result}"
        );
        return;
    }
    let text = result["content"][0]["text"]
        .as_str()
        .expect("content[0] is a text block");
    let parsed: Value = serde_json::from_str(text).expect("text block is JSON");
    assert_eq!(
        parsed, result["structuredContent"],
        "text block ≠ structuredContent"
    );
    common::validate_or_panic(tool, &result["structuredContent"]);
}

fn parsed(result: &Value) -> Value {
    result["structuredContent"].clone()
}

fn is_error(result: &Value) -> bool {
    result["isError"].as_bool().unwrap_or(false)
}

fn error_text(result: &Value) -> &str {
    result["content"][0]["text"].as_str().expect("text block")
}

#[test]
fn initialize_advertises_tools_and_the_suite_preamble() {
    let session = Session::start();
    let init = &session.initialize;
    assert_eq!(init["protocolVersion"], "2025-06-18");
    assert_eq!(init["capabilities"]["tools"], json!({}));
    assert_eq!(init["serverInfo"]["name"], "zshref-mcp");
    assert_eq!(init["serverInfo"]["version"], env!("CARGO_PKG_VERSION"));
    assert_eq!(
        init["instructions"],
        zshref::tools::prose::preamble(Target::Json).as_str()
    );
    session.finish();
}

#[test]
fn tools_list_equals_the_tool_set_in_order() {
    let mut session = Session::start();
    let listed = session.request("tools/list", json!({}));
    let listed = listed["tools"].as_array().expect("tools array");
    let tools = &common::tool_set().tools;
    assert_eq!(listed.len(), tools.len());
    for (listed, tool) in listed.iter().zip(tools) {
        let name = tool.name.json();
        assert_eq!(listed["name"], name);
        assert_eq!(
            listed["description"],
            tool.prose.long.json.as_str(),
            "{name}"
        );
        assert_eq!(listed["inputSchema"], tool.input_schema, "{name}");
        assert_eq!(listed["outputSchema"], tool.output_schema, "{name}");
    }
    session.finish();
}

#[test]
fn docs_returns_a_builtin() {
    let mut session = Session::start();
    let out = parsed(&session.call("zsh_docs", json!({ "key": "echo" })));
    let first = &out["matches"][0];
    assert_eq!(first["category"], "builtin");
    assert_eq!(first["id"], "echo");
    assert!(first["title"].as_str().expect("title").contains("echo"));
    assert!(first["mdBody"].as_str().expect("mdBody").contains("echo"));
    assert_eq!(out["matchesReturned"], out["matchesTotal"]);
    session.finish();
}

#[test]
fn docs_surfaces_option_negation_as_feedback() {
    let mut session = Session::start();
    let out = parsed(&session.call(
        "zsh_docs",
        json!({ "key": "NO_AUTO_CD", "category": "option" }),
    ));
    assert_eq!(out["matches"][0]["id"], "autocd");
    assert_eq!(
        out["matches"][0]["feedback"],
        json!({ "kind": "input-negated" })
    );
    session.finish();
}

#[test]
fn docs_unknown_key_is_an_empty_envelope() {
    let mut session = Session::start();
    let result = session.call("zsh_docs", json!({ "key": "not_a_thing_qq" }));
    assert!(!is_error(&result));
    assert_eq!(
        parsed(&result),
        json!({ "matches": [], "matchesReturned": 0, "matchesTotal": 0 })
    );
    session.finish();
}

#[test]
fn search_and_list_return_identity_only_rows() {
    let mut session = Session::start();
    let search = parsed(&session.call(
        "zsh_search",
        json!({ "query": "echo", "category": "builtin", "limit": 5 }),
    ));
    let matches = search["matches"].as_array().expect("matches");
    assert!(!matches.is_empty());
    assert_eq!(matches[0]["id"], "echo");
    let list = parsed(&session.call(
        "zsh_list",
        json!({ "category": "precmd_modifier", "limit": 100 }),
    ));
    let rows = list["matches"].as_array().expect("matches");
    assert!(!rows.is_empty());
    for m in matches.iter().chain(rows) {
        assert!(
            m.get("mdBody").is_none(),
            "identity-only row carries mdBody: {m}"
        );
    }
    for m in rows {
        assert_eq!(m["category"], "precmd_modifier");
    }
    session.finish();
}

#[test]
fn omitted_limit_takes_the_schema_default() {
    let mut session = Session::start();
    let default = common::tool_set().get(ToolName::Search).input_schema["properties"]["limit"]
        ["default"]
        .clone();
    let out = parsed(&session.call("zsh_search", json!({ "query": "e" })));
    assert!(
        out["matchesTotal"].as_u64() > default.as_u64(),
        "query must overflow the default"
    );
    assert_eq!(out["matchesReturned"], default);
    session.finish();
}

#[test]
fn invalid_input_is_a_tool_error() {
    let mut session = Session::start();
    let cases = [
        (
            "zsh_search",
            json!({ "query": "echo", "limit": null }),
            "invalid type: null",
        ),
        ("zsh_docs", json!({}), "missing field `key`"),
        ("zsh_list", json!({ "bogus": 1 }), "unknown field `bogus`"),
    ];
    for (tool, args, fragment) in cases {
        let result = session.call(tool, args);
        assert!(is_error(&result), "{tool}: {result}");
        let text = error_text(&result);
        assert!(text.starts_with("invalid input: "), "{tool}: {text}");
        assert!(text.contains(fragment), "{tool}: {text}");
    }
    session.finish();
}

#[test]
fn unknown_tool_is_a_tool_error() {
    let mut session = Session::start();
    let result = session.call("does_not_exist", json!({}));
    assert!(is_error(&result));
    assert_eq!(error_text(&result), "unknown tool: does_not_exist");
    session.finish();
}

#[test]
fn pipelined_requests_are_answered_by_id() {
    let mut session = Session::start();
    let a = session.send(
        "tools/call",
        json!({ "name": "zsh_docs", "arguments": { "key": "if" } }),
    );
    let b = session.send(
        "tools/call",
        json!({ "name": "zsh_docs", "arguments": { "key": "AUTO_CD" } }),
    );
    let rb = session.response(b);
    let ra = session.response(a);
    check_call_result("zsh_docs", &ra);
    check_call_result("zsh_docs", &rb);
    assert_eq!(parsed(&ra)["matches"][0]["id"], "if");
    assert_eq!(parsed(&rb)["matches"][0]["id"], "autocd");
    session.finish();
}

#[test]
fn stdin_eof_before_initialize_exits_quietly() {
    let out = Command::new(BIN)
        .stdin(Stdio::null())
        .output()
        .expect("spawn zshref-mcp");
    assert!(out.status.success(), "exit {:?}", out.status.code());
    assert!(out.stdout.is_empty());
    assert!(out.stderr.is_empty());
}

fn run(args: &[&str]) -> std::process::Output {
    Command::new(BIN)
        .args(args)
        .output()
        .expect("spawn zshref-mcp")
}

#[test]
fn help_is_on_stdout_within_80_columns() {
    for flag in ["--help", "-h"] {
        let out = run(&[flag]);
        assert!(out.status.success());
        assert!(out.stderr.is_empty());
        let help = String::from_utf8(out.stdout).expect("utf-8");
        for needle in [
            "zshref-mcp",
            "--help",
            "--version",
            "github.com/carlwr/zshref",
        ] {
            assert!(help.contains(needle), "{flag} lacks {needle:?}");
        }
        for line in help.lines() {
            assert!(line.chars().count() <= 80, "{line:?}");
        }
    }
}

#[test]
fn version_is_the_cli_version_block() {
    let cli = String::from_utf8(common::run_raw(&["--version"]).stdout).expect("utf-8");
    let expected = cli
        .strip_prefix("zshref ")
        .map(|rest| format!("zshref-mcp {rest}"))
        .expect("`zshref --version` leads with the bin name");
    for flag in ["--version", "-V"] {
        let out = run(&[flag]);
        assert!(out.status.success());
        assert!(out.stderr.is_empty());
        assert_eq!(
            String::from_utf8(out.stdout).expect("utf-8"),
            expected,
            "{flag}"
        );
    }
}
