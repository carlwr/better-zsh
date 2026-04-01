import * as assert from "node:assert";
import { vi } from "vitest";

vi.mock("vscode", () => ({
	Range: class {
		start: { line: number; character: number };
		end: { line: number; character: number };

		constructor(
			startLine: number,
			startChar: number,
			endLine: number,
			endChar: number,
		) {
			this.start = { line: startLine, character: startChar };
			this.end = { line: endLine, character: endChar };
		}
	},
}));

import { funcDocs as buildFuncDocs } from "../funcs";

// Minimal stub satisfying the subset of vscode.TextDocument used by buildFuncDocs
let id = 0;

function fakeDoc(text: string) {
	const lines = text.split("\n");
	return {
		uri: { toString: () => `test://hover/${id++}` },
		version: 1,
		lineCount: lines.length,
		lineAt(i: number) {
			return { text: lines[i] ?? "" };
		},
	} as import("vscode").TextDocument;
}

suite("buildFuncDocs", () => {
	test("comment block above funcname()", () => {
		const docs = buildFuncDocs(
			fakeDoc("# does stuff\n# usage: foo arg\nfoo() {"),
		);
		assert.strictEqual(docs.get("foo"), "does stuff\nusage: foo arg");
	});

	test("comment block above function keyword form", () => {
		const docs = buildFuncDocs(fakeDoc("# the bar func\nfunction bar {"));
		assert.strictEqual(docs.get("bar"), "the bar func");
	});

	test("comment block below declaration", () => {
		const docs = buildFuncDocs(
			fakeDoc("my-func()\n# inline doc\n# second line"),
		);
		assert.strictEqual(docs.get("my-func"), "inline doc\nsecond line");
	});

	test("prefers above over below when both present", () => {
		const docs = buildFuncDocs(fakeDoc("# above\nfoo()\n# below"));
		assert.strictEqual(docs.get("foo"), "above");
	});

	test("no docs for functions without adjacent comments", () => {
		const docs = buildFuncDocs(fakeDoc("foo() {\n  echo hi\n}"));
		assert.strictEqual(docs.has("foo"), false);
	});

	test("blank line breaks comment collection", () => {
		const docs = buildFuncDocs(fakeDoc("# orphan comment\n\nfoo() {"));
		assert.strictEqual(docs.has("foo"), false);
	});

	test("multiple functions each get their docs", () => {
		const docs = buildFuncDocs(fakeDoc("# doc a\na()\n\n# doc b\nb()"));
		assert.strictEqual(docs.get("a"), "doc a");
		assert.strictEqual(docs.get("b"), "doc b");
	});

	test("dashed function names work", () => {
		const docs = buildFuncDocs(fakeDoc("# my docs\nmy-long-name() {"));
		assert.strictEqual(docs.get("my-long-name"), "my docs");
	});

	test("comments below declaration with $0 in text", () => {
		const docs = buildFuncDocs(
			fakeDoc(
				"cheer()\n  # docs line1\n  # usage: $0 TITLE\n  # example: $0 Mister -> prints 'You go, Mister!'",
			),
		);
		assert.strictEqual(
			docs.get("cheer"),
			[
				"docs line1",
				"usage: $0 TITLE",
				"example: $0 Mister -> prints 'You go, Mister!'",
			].join("\n"),
		);
	});
});
