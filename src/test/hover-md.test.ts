import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { dumpText, writeHoverDump } from "../hover-dump";
import {
	hoverDocs,
	hoverMdRegressions,
	mdCond,
	mdOpt,
	mdParam,
} from "../hover-md";
import { mkCondOp, mkOptLetter, mkOptName } from "../types/brand";
import type { CondOperator, ZshOption } from "../types/zsh-data";
import { getCondOps, getOptions, initZshData } from "../zsh-data";

const root = resolve(__dirname, "../..");

const opt: ZshOption = {
	name: mkOptName("AUTO_CD"),
	display: "AUTO_CD",
	letter: mkOptLetter("J"),
	defaults: ["D"],
	category: "Changing Directories",
	desc: "Desc.",
};

const unary: CondOperator = {
	op: mkCondOp("-a"),
	operands: ["file"],
	desc: "Exists.",
	kind: "unary",
};

const binary: CondOperator = {
	op: mkCondOp("-nt"),
	operands: ["left", "right"],
	desc: "Newer than.",
	kind: "binary",
};

describe("hover markdown", () => {
	test("renders option markdown", () => {
		expect(mdOpt(opt)).toBe(
			"`AUTO_CD` (`-J`) <D>\n\nDesc.\n\n_Category:_ Changing Directories",
		);
	});

	test("renders cond op markdown", () => {
		expect(mdCond(unary)).toBe("`-a` *file*\n\nExists.");
		expect(mdCond(binary)).toBe("*left* `-nt` *right*\n\nNewer than.");
	});

	test("renders param markdown", () => {
		expect(mdParam("SECONDS", "integer-special-readonly-export")).toBe(
			"`SECONDS`: integer (readonly, exported) — zsh special parameter",
		);
	});

	test("collects docs and sorts params", () => {
		const docs = hoverDocs({
			options: [opt],
			condOps: [unary],
			params: new Map([
				["SECONDS", "integer-special-readonly"],
				["argv", "array-special"],
			]),
		});
		expect(docs.map((doc) => `${doc.kind}:${doc.key}`)).toEqual([
			"option:AUTO_CD",
			"cond-op:-a",
			"param:argv",
			"param:SECONDS",
		]);
	});

	test("regression registry is easy to find", () => {
		expect(hoverMdRegressions).toEqual([]);
	});
});

describe("hover dump", () => {
	test("renders per-kind dump files", () => {
		const docs = hoverDocs({
			options: [opt],
			condOps: [binary],
			params: new Map([["SECONDS", "integer-special-readonly"]]),
		});
		const files = dumpText(docs);
		expect(files.get("options.md")).toContain("## AUTO_CD");
		expect(files.get("cond-ops.md")).toContain("## -nt");
		expect(files.get("params.md")).toContain("## SECONDS");
		expect(files.get("all.md")).toContain("## AUTO_CD");
		expect(files.get("all.md")).toContain("## -nt");
		expect(files.get("all.md")).toContain("## SECONDS");
	});

	test("writes dump files", async () => {
		const dir = mkdtempSync(join(tmpdir(), "better-zsh-hover-"));
		try {
			await writeHoverDump(
				dir,
				hoverDocs({
					options: [opt],
					condOps: [binary],
					params: new Map([["SECONDS", "integer-special-readonly"]]),
				}),
			);
			expect(readFileSync(join(dir, "all.md"), "utf8")).toContain("## AUTO_CD");
			expect(readFileSync(join(dir, "options.md"), "utf8")).toContain("Desc.");
			expect(readFileSync(join(dir, "cond-ops.md"), "utf8")).toContain(
				"Newer than.",
			);
			expect(readFileSync(join(dir, "params.md"), "utf8")).toContain(
				"`SECONDS`",
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	describe("vendored docs", () => {
		initZshData(root);
		const options = getOptions();
		const condOps = getCondOps();
		const docs = hoverDocs({
			options,
			condOps,
			params: new Map([["SECONDS", "integer-special-readonly"]]),
		});
		const files = dumpText(docs);

		test("covers all vendored options and cond ops", () => {
			expect(docs.filter((doc) => doc.kind === "option")).toHaveLength(
				options.length,
			);
			expect(docs.filter((doc) => doc.kind === "cond-op")).toHaveLength(
				condOps.length,
			);
			expect((files.get("options.md")?.match(/^## /gm) ?? []).length).toBe(
				options.length,
			);
			expect((files.get("cond-ops.md")?.match(/^## /gm) ?? []).length).toBe(
				condOps.length,
			);
		});

		test("emitted markdown strips raw yodl markers", () => {
			expect(files.get("options.md")).not.toContain("tt(");
			expect(files.get("options.md")).not.toContain("var(");
			expect(files.get("cond-ops.md")).not.toContain("tt(");
			expect(files.get("cond-ops.md")).not.toContain("var(");
		});
	});
});
