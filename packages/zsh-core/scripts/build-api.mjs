import { buildApi } from "../../../scripts/api-extractor.mjs"

const entries = [
  { entry: "analysis", subpath: "./analysis" },
  { entry: "assets", subpath: "./assets" },
  { entry: "exec", subpath: "./exec" },
  { entry: "index", subpath: "." },
  { entry: "meta", subpath: "./meta" },
  { entry: "render", subpath: "./render" },
  { entry: "resolver", subpath: "./resolver" },
  { entry: "taxonomy", subpath: "./taxonomy" },
  { entry: "types", subpath: "./types" },
]

await buildApi({ packageScriptUrl: import.meta.url, entries })
