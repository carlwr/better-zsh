import * as assert from "node:assert";
import * as vscode from "vscode";
import { hasZsh, openFixture, withBadZdotdir } from "./helpers";

suite("ZshCompletions", function () {
	this.timeout(15000);

	suiteSetup(function () {
		if (!hasZsh()) this.skip();
	});

	test("includes file tokens and builtins", async () => {
		const doc = await openFixture("test.zsh");
		const items = await vscode.commands.executeCommand<vscode.CompletionList>(
			"vscode.executeCompletionItemProvider",
			doc.uri,
			new vscode.Position(0, 0),
		);
		assert.ok(items, "expected completion result");
		const labels = items.items.map((i) =>
			typeof i.label === "string" ? i.label : i.label.label,
		);
		assert.ok(
			labels.includes("some-func"),
			"expected file token 'some-func' in completions",
		);
		assert.ok(
			labels.includes("echo"),
			"expected builtin 'echo' in completions",
		);
	});

	test("tokenization ignores user ZDOTDIR", async () => {
		await withBadZdotdir(async () => {
			const doc = await openFixture("test.zsh");
			const items = await vscode.commands.executeCommand<vscode.CompletionList>(
				"vscode.executeCompletionItemProvider",
				doc.uri,
				new vscode.Position(0, 0),
			);
			assert.ok(items, "expected completion result");
			const labels = items.items.map((i) =>
				typeof i.label === "string" ? i.label : i.label.label,
			);
			assert.ok(
				labels.includes("some-func"),
				"expected file token 'some-func' in completions",
			);
		});
	});
});
