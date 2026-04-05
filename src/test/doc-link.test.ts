import { describe, expect, test } from "vitest";
import { extractSourcePaths } from "../doc-link";

describe("extractSourcePaths", () => {
	test("detects source ./path", () => {
		const r = extractSourcePaths("source ./lib.zsh");
		expect(r).toHaveLength(1);
		expect(r[0]?.path).toBe("./lib.zsh");
	});

	test("detects . ./path", () => {
		const r = extractSourcePaths(". ./lib.zsh");
		expect(r).toHaveLength(1);
		expect(r[0]?.path).toBe("./lib.zsh");
	});

	test("detects absolute path", () => {
		const r = extractSourcePaths("source /etc/zsh/zshrc");
		expect(r).toHaveLength(1);
		expect(r[0]?.path).toBe("/etc/zsh/zshrc");
	});

	test("skips $variable paths", () => {
		const r = extractSourcePaths("source $HOME/.zshrc");
		expect(r).toHaveLength(0);
	});

	test("skips ${variable} paths", () => {
		const r = extractSourcePaths("source ${ZDOTDIR}/.zshrc");
		expect(r).toHaveLength(0);
	});

	test("ignores paths in comments", () => {
		const r = extractSourcePaths("# source ./lib.zsh");
		expect(r).toHaveLength(0);
	});

	test("handles inline source after command", () => {
		const r = extractSourcePaths("echo foo; source ./lib.zsh");
		expect(r).toHaveLength(1);
		expect(r[0]?.path).toBe("./lib.zsh");
	});

	test("returns correct start position", () => {
		const r = extractSourcePaths("source ./lib.zsh");
		expect(r[0]?.start).toBe(7);
	});

	test("returns empty for no source/. commands", () => {
		expect(extractSourcePaths("echo hello")).toHaveLength(0);
	});
});
