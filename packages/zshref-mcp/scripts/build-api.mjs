import { buildApi } from "../../../scripts/api-extractor.mjs"

// `server.ts` has stdio side effects and no exports, so API Extractor cannot
// roll it up; tsup still emits its .d.ts.
const entries = [{ entry: "index", subpath: "." }]

await buildApi({ packageScriptUrl: import.meta.url, entries })
