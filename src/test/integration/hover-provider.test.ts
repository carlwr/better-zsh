import * as assert from "node:assert";
import * as vscode from "vscode";
import { openText } from "./helpers";

async function hoverText(doc: vscode.TextDocument, pos: vscode.Position) {
	const hovers =
		(await vscode.commands.executeCommand<vscode.Hover[]>(
			"vscode.executeHoverProvider",
			doc.uri,
			pos,
		)) ?? [];
	assert.ok(hovers.length > 0, "expected hover");
	return hovers
		.flatMap((h) => h.contents)
		.map((c) => {
			if (typeof c === "string") return c;
			return (c as { value: string }).value;
		})
		.join("\n\n");
}

suite("ZshHoverProvider", () => {
	test("shows docs for == inside [[ ]]", async () => {
		const doc = await openText("[[ 1 == 2 ]]");
		const text = await hoverText(doc, new vscode.Position(0, 5));
		assert.match(text, /matches pattern/i);
	});

	test("option hover keeps category out of the title line", async () => {
		const doc = await openText("setopt warn_nested_var");
		const text = await hoverText(doc, new vscode.Position(0, 10));
		assert.strictEqual(text.split("\n")[0], "`WARN_NESTED_VAR`");
		assert.match(text, /Expansion and Globbing/);
		assert.ok(!text.includes("example("), "expected example() markup stripped");
	});
});
