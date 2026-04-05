import * as assert from "node:assert";
import { vi } from "vitest";

type Token = {
	line: number;
	start: number;
	length: number;
	type: number;
	modifiers: number;
};

vi.mock("vscode", () => ({
	SemanticTokensLegend: class {},
	SemanticTokensBuilder: class {
		private tokens: Token[] = [];

		push(
			line: number,
			start: number,
			length: number,
			type: number,
			modifiers: number,
		) {
			this.tokens.push({ line, start, length, type, modifiers });
		}

		build() {
			return this.tokens;
		}
	},
}));

import { SemanticTokensProvider } from "../semantic-tokens";

function doc(text: string) {
	const lines = text.split("\n");
	return {
		lineCount: lines.length,
		lineAt(i: number) {
			return { text: lines[i] ?? "" };
		},
	} as import("vscode").TextDocument;
}

function words(text: string, builtins: string[]) {
	const lines = text.split("\n");
	const tokens = new SemanticTokensProvider(
		builtins,
	).provideDocumentSemanticTokens(doc(text)) as unknown as Token[];
	return tokens.map(
		(t) => lines[t.line]?.slice(t.start, t.start + t.length) ?? "",
	);
}

suite("SemanticTokensProvider", () => {
	test("marks builtin commands", () => {
		assert.deepStrictEqual(words("echo hi\nread var", ["echo", "read"]), [
			"echo",
			"read",
		]);
	});

	test("skips for-loop variables even if they are builtins", () => {
		assert.deepStrictEqual(
			words("for r in one two; do echo $r; done", ["r", "echo"]),
			["echo"],
		);
	});

	test("skips function names in definitions even if they are builtins", () => {
		assert.deepStrictEqual(
			words("a() uname -a\nr() uname -a\ns() uname -a", ["r", "uname"]),
			["uname", "uname", "uname"],
		);
	});
});
