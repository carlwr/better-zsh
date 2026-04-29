/**
 * Long-lived `zshref batch` session. One process spawned per test file
 * (via `beforeAll` / `afterAll`); requests are written one JSON line at
 * a time and responses come back in order as JSON lines on stdout.
 *
 * Calls must be serialized — the protocol is one request, one response,
 * in order. fast-check's `asyncProperty` and `test.each` both await
 * sequentially, so the obvious usage is safe.
 */

import { type ChildProcessByStdio, spawn } from "node:child_process"
import { createInterface, type Interface } from "node:readline"
import type { Readable, Writable } from "node:stream"

interface BatchResponse {
  readonly ok: boolean
  readonly output?: unknown
  readonly error?: string
}

export class ZshrefBatch {
  private readonly child: ChildProcessByStdio<Writable, Readable, null>
  private readonly rl: Interface
  private readonly queue: ((line: string) => void)[] = []

  constructor(binPath: string) {
    this.child = spawn(binPath, ["batch"], {
      stdio: ["pipe", "pipe", "inherit"],
    })
    this.rl = createInterface({ input: this.child.stdout })
    this.rl.on("line", line => {
      const resolver = this.queue.shift()
      if (resolver) resolver(line)
    })
  }

  async call(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const req = JSON.stringify({ tool: toolName, input })
    const lineP = new Promise<string>(resolve => this.queue.push(resolve))
    this.child.stdin.write(`${req}\n`)
    const resp = JSON.parse(await lineP) as BatchResponse
    if (!resp.ok) {
      throw new Error(
        `zshref batch error: ${resp.error ?? "(no error message)"} for ${req}`,
      )
    }
    return resp.output
  }

  async close(): Promise<void> {
    this.child.stdin.end()
    await new Promise<void>(resolve =>
      this.child.once("close", () => resolve()),
    )
  }
}
