import { mkdirSync, writeFileSync } from "node:fs";
import { buildChatInstructions } from "./chat-instructions";
import { langConfig } from "./lang-config";
import { buildSnippetJson } from "./snippets";

export async function generateAssets() {
	mkdirSync("out", { recursive: true });

	writeFileSync(
		"out/language-configuration.json",
		JSON.stringify(langConfig, null, "\t"),
	);

	writeFileSync(
		"out/snippets.json",
		JSON.stringify(buildSnippetJson(), null, "\t"),
	);

	writeFileSync("out/zsh-chat-instructions.md", buildChatInstructions());
}
