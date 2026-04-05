import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { mkCondOp, mkOptFlagChar, mkOptName } from "../types/brand";

describe("mkOptName", () => {
	test("normalizes known equivalences", () => {
		expect(mkOptName("EXTENDED_GLOB")).toBe(mkOptName("extendedglob"));
		expect(mkOptName("EXTENDED_GLOB")).toBe(mkOptName("extended_glob"));
		expect(mkOptName("AUTO_CD")).toBe(mkOptName("autocd"));
	});

	test("is idempotent", () => {
		fc.assert(
			fc.property(fc.string(), (s: string) => {
				expect(mkOptName(mkOptName(s))).toBe(mkOptName(s));
			}),
		);
	});

	test("result is lowercase, no underscores", () => {
		fc.assert(
			fc.property(fc.string(), (s: string) => {
				const r = mkOptName(s);
				expect(r).toBe(r.toLowerCase());
				expect(r).not.toContain("_");
			}),
		);
	});
});

describe("mkCondOp", () => {
	test("trims whitespace", () => {
		expect(mkCondOp("  -a  ")).toBe(mkCondOp("-a"));
	});

	test("preserves non-whitespace", () => {
		fc.assert(
			fc.property(fc.string(), (s: string) => {
				expect(mkCondOp(s) as string).toBe(s.trim());
			}),
		);
	});
});

describe("mkOptFlagChar", () => {
	test("trims whitespace", () => {
		expect(mkOptFlagChar(" J ")).toBe(mkOptFlagChar("J"));
	});
});
