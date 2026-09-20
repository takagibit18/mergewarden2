import { parentPort, workerData } from "node:worker_threads";
import { SnapshotStore } from "../snapshot/store.ts";
import { SqliteCodeGraph } from "./sqlite-store.ts";
try {
  const store = await SnapshotStore.load(workerData.stateDir, workerData.snapshotId);
  const { graph, metrics } = await SqliteCodeGraph.open(store);
  try {
    const start = performance.now();
    const page = workerData.method === "lookup" ? await graph.lookup(workerData.input) : await graph.neighbors(workerData.input);
    metrics.queryMs = performance.now() - start; parentPort!.postMessage({ page, metrics });
  } finally { graph.close(); }
} catch { parentPort!.postMessage({ error: "Graph index/query failed; use immutable text tools. This is not evidence of absence." }); }
