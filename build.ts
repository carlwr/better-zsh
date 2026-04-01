import { build } from "tsup";

(async () => {
	await build({
		entry: ["src/extension.ts"],
		outDir: "out",
		format: ["cjs"],
		sourcemap: true,
		clean: true,
		external: ["vscode"],
		watch: process.argv.includes("--watch"),
	});
})();
