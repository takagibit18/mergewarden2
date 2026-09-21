import { Worker } from "node:worker_threads";
import { emptyCoverage } from "./contracts.ts";
import type { CodeGraph, GraphPage, RelationFact, SymbolFact } from "./contracts.ts";
import type { GraphMetrics } from "./sqlite-store.ts";
/** Worker-per-request keeps SQLite/parser off the model loop and permits hard cancellation. */
export class LazyCodeGraph implements CodeGraph {
  private stateDir: string; private snapshotId: string;
  metrics = { buildMs: 0, queryMs: 0, warmRequestMs: [] as number[], coldRequestMs: [] as number[], calls: 0, coverage: emptyCoverage() };
  constructor(stateDir: string, snapshotId: string) { this.stateDir = stateDir; this.snapshotId = snapshotId; }
  private async query<T>(method: string, input: { snapshotId: string }, signal?: AbortSignal): Promise<GraphPage<T>> {
    signal?.throwIfAborted(); if (input.snapshotId !== this.snapshotId) throw new Error("Graph snapshot mismatch");
    const start = performance.now(); this.metrics.calls++;
    const result = await new Promise<{ page?: GraphPage<T>; metrics?: GraphMetrics; error?: string }>((resolve, reject) => {
      const worker = new Worker(new URL("./worker.ts", import.meta.url), { workerData: { stateDir: this.stateDir, snapshotId: this.snapshotId, method, input }, execArgv: ["--experimental-strip-types"], resourceLimits: { maxOldGenerationSizeMb: 512 } });
      let settled = false;
      const finish = (action: () => void) => { if (settled) return; settled = true; signal?.removeEventListener("abort", cancel); void worker.terminate().then(action, action); };
      const cancel = () => finish(() => reject(signal?.reason ?? new Error("Graph cancelled")));
      signal?.addEventListener("abort", cancel, { once: true }); if (signal?.aborted) cancel();
      worker.once("message", value => finish(() => resolve(value)));
      worker.once("error", () => finish(() => resolve({ error: "Graph worker failed; empty results cannot establish absence." })));
      worker.once("exit", () => finish(() => resolve({ error: "Graph worker exited before a verified result." })));
    });
    signal?.throwIfAborted();
    if (result.metrics) {
      this.metrics.buildMs += result.metrics.buildMs; this.metrics.queryMs += result.metrics.queryMs; this.metrics.coverage = result.metrics.coverage;
      (result.metrics.cacheHit ? this.metrics.warmRequestMs : this.metrics.coldRequestMs).push(performance.now() - start);
    }
    return result.page ?? { status: "error", snapshotId: this.snapshotId, revision: "head", items: [], truncated: false, coverage: emptyCoverage(), warnings: [result.error ?? "Graph failed"] };
  }
  lookup(input: Parameters<CodeGraph["lookup"]>[0], signal?: AbortSignal) { return this.query<SymbolFact>("lookup", input, signal); }
  neighbors(input: Parameters<CodeGraph["neighbors"]>[0], signal?: AbortSignal) { return this.query<RelationFact>("neighbors", input, signal); }
}
