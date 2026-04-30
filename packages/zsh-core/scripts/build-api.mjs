import { buildApi } from "../../../scripts/api-extractor.mjs"

const entries = [
  { entry: "index", subpath: "." },
  { entry: "render", subpath: "./render" },
  { entry: "exec", subpath: "./exec" },
  { entry: "assets", subpath: "./assets" },
]

await buildApi({ packageScriptUrl: import.meta.url, entries })
