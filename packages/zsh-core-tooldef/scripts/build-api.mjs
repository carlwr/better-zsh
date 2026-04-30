import { buildApi } from "../../../scripts/api-extractor.mjs"

const entries = [{ entry: "index", subpath: "." }]

await buildApi({ packageScriptUrl: import.meta.url, entries })
