// Probe for the "NLP moves to zshref-web" step (nlp-move.md §"Port notes"):
// embeds a sample of the captured index's retrieval texts with transformers.js
// (onnxruntime-node, the pinned local model) and reports the cosine against the
// Rust (fastembed) vectors in .aux/nlp-move/rust/index.json — once with the
// pipeline's own truncation, once with HF-tokenizers-style truncation. Seed for
// the S3 vectors gate; not part of any package.
//
//   pnpm exec tsx .reorg-work/probe-embedder.mts [sample-size]
//
// Needs: a capture under .aux/nlp-move/, the model under
// packages/zshref-web/.aux/model/ (scripts/fetch-model there), and the
// workspace installed (resolves transformers.js via zshref-web).

import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const modelDir = join(root, "packages", "zshref-web", ".aux", "model")
const sampleSize = Number(process.argv[2] ?? 80)
const CONTENT_MAX = 510 // 512 minus [CLS] and [SEP], as HF tokenizers count it

const req = createRequire(join(root, "packages", "zshref-web", "package.json"))
const txEntry = req.resolve("@huggingface/transformers").replace(/\.cjs$/, ".mjs")
const tx = await import(pathToFileURL(txEntry).href)
tx.env.allowRemoteModels = false
tx.env.allowLocalModels = true
tx.env.localModelPath = dirname(modelDir)
const tokenizer = await tx.AutoTokenizer.from_pretrained("model")
const model = await tx.AutoModel.from_pretrained("model", { dtype: "fp32" })
// The specials as the tokenizer adds them around an empty input.
const [CLS, SEP] = tokenizer("", { add_special_tokens: true, return_tensor: false }).input_ids

const index = JSON.parse(
  readFileSync(join(root, ".aux", "nlp-move", "rust", "index.json"), "utf8"),
)

function unit(v: Float32Array): Float32Array {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n)
  return v.map(x => x / n)
}
function cosine(a: Float32Array, b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0)
  return s
}
function clsOf(out: { last_hidden_state: { data: Float32Array } }) {
  return unit(new Float32Array(out.last_hidden_state.data.slice(0, 384)))
}

/** The feature-extraction pipeline's behaviour: specials added, then cut at 512. */
async function embedPipeline(text: string): Promise<Float32Array> {
  return clsOf(await model(tokenizer(text, { padding: true, truncation: true })))
}

/** HF tokenizers (fastembed): content cut to 510, then [CLS] … [SEP]. */
async function embedHfTruncation(text: string): Promise<Float32Array> {
  const enc = tokenizer(text, {
    add_special_tokens: false,
    truncation: true,
    max_length: CONTENT_MAX,
    return_tensor: false,
  })
  const ids = [CLS, ...enc.input_ids, SEP]
  const tensor = (fill: (id: number) => bigint) =>
    new tx.Tensor("int64", BigInt64Array.from(ids.map(fill)), [1, ids.length])
  return clsOf(
    await model({
      input_ids: tensor(BigInt),
      attention_mask: tensor(() => 1n),
      token_type_ids: tensor(() => 0n),
    }),
  )
}

type Row = { rec: string; view: string; chars: number; cos: number }
const step = Math.max(1, Math.floor(index.records.length / sampleSize))
const rows: Record<"pipeline" | "hf", Row[]> = { pipeline: [], hf: [] }
for (let i = 0; i < index.records.length; i += step) {
  const { text, vectors } = index.records[i]
  for (const view of ["structured", "body", "expanded"] as const) {
    const passage = `passage: ${text[view]}`
    const row = (cos: number) => ({
      rec: `${text.category}/${text.id}`,
      view,
      chars: text[view].length,
      cos,
    })
    rows.pipeline.push(row(cosine(await embedPipeline(passage), vectors[view])))
    rows.hf.push(row(cosine(await embedHfTruncation(passage), vectors[view])))
  }
}

for (const [mode, list] of Object.entries(rows)) {
  list.sort((a, b) => a.cos - b.cos)
  const q = (p: number) => list[Math.min(list.length - 1, Math.floor(p * list.length))]
  console.log(
    `${mode.padEnd(9)} n=${list.length}  cos min=${q(0).cos.toFixed(6)}  p1=${q(0.01).cos.toFixed(6)}  p5=${q(0.05).cos.toFixed(6)}  median=${q(0.5).cos.toFixed(6)}`,
  )
  for (const r of list.slice(0, 3))
    console.log(`  worst: ${r.cos.toFixed(6)}  ${r.rec}  ${r.view}  ${r.chars} chars`)
}
