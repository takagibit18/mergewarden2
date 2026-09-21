import type { SessionJournal } from "../ports/journal.ts";
import type { FindingCandidate, ReviewReport } from "../domain/contracts.ts";
import type { ReviewInput } from "../snapshot/contracts.ts";
export interface ModelSelection { provider: string; modelId: string }
export interface ReviewOptions {
  repositoryPath: string; stateDir: string; input?: ReviewInput; rerunId?: string;
  model: ModelSelection; timeoutMs?: number; maxToolCalls?: number; signal?: AbortSignal;
  /** Internal ablation only; never exposed as a product mode. */
  evaluation?: { tools: "text-only" | "text+graph" | "text+locagent"; retrieval?: import("../experiments/locagent/contracts.ts").RetrievalConfig };
}
export interface RuntimeTool { name: string; description: string; schema: Record<string, unknown>; execute(input: unknown): Promise<unknown> }
export interface ReviewRuntime {
  journal: SessionJournal;
  prompt(text: string, signal: AbortSignal): Promise<void>;
  abort(): Promise<void>;
  dispose(): void;
  usage(): { input: number; output: number; total: number };
  configuration?(): { systemPrompt: string; thinkingLevel: string; modelApi: string; modelBaseUrl: string; modelMaxTokens: number };
}
export type RuntimeFactory = (options: { repositoryPath: string; runDir: string; stateDir: string; model: ModelSelection; tools: RuntimeTool[]; evaluation?: boolean }) => Promise<ReviewRuntime>;
export interface FinalSubmission { summary: string; reviewedPaths: string[]; findings: FindingCandidate[] }
export interface RunManifest {
  schemaVersion: 1; runId: string; snapshotId: string; repositoryPath: string; model: ModelSelection;
  configurationFingerprint: string; limits: { timeoutMs: number; maxToolCalls: number };
  status: "running" | "delivered" | "delivery_failed"; createdAt: string; finishedAt?: string;
  parentRunId?: string; outcome?: ReviewReport["status"]; error?: string;
  reportSha256?: string; markdownSha256?: string; usage?: { input: number; output: number; total: number };
  metrics?: { toolCalls: number; graphToolCalls: number; reviewLatencyMs: number; graph: import("../graph/lazy-graph.ts").LazyCodeGraph["metrics"]; navigation: { attempted: boolean; degraded: boolean; errors: number } };
  toolExposure?: "text-only" | "text+graph" | "text+locagent";
  runtimeConfiguration?: ReturnType<NonNullable<ReviewRuntime["configuration"]>>;
}
export type ReviewResult = { kind: "no_changes"; snapshotId: string } | { kind: "report"; runId: string; report: ReviewReport; reportPath: string; markdownPath: string };
export type ReviewProgress = { phase: "preparing" | "reviewing" | "tool" | "delivering"; runId?: string; tool?: string; toolCalls?: number };
