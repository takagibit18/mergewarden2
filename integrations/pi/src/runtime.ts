import { closeSync, openSync } from "node:fs";
import { join } from "node:path";
import type { TSchema } from "typebox";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { RuntimeFactory } from "../../../src/engine/contracts.ts";
import { createReviewExtension } from "./extension.ts";
import { registerBigModel } from "./bigmodel.ts";
import { PiSessionJournal } from "./journal.ts";
import { BASE_SYSTEM_PROMPT, GRAPH_CAPABILITY_PROMPT, NAVIGATION_POLICY_PROMPT } from "../../../src/engine/prompt.ts";
import { LOCAGENT_CAPABILITY_PROMPT } from "../../../src/experiments/locagent/contracts.ts";
export async function createModelRuntime(provider?: string, key?: string): Promise<ModelRuntime> {
  const runtime = await ModelRuntime.create({ modelsPath: null, allowModelNetwork: false, refreshOnCreate: false,
    credentials: {
      async read(id) { return id === provider && key ? { type: "api_key", key } : undefined; },
      async list() { return provider && key ? [{ providerId: provider, type: "api_key" }] : []; },
      async modify() { throw new Error("Credential writes and OAuth are disabled"); }, async delete() { throw new Error("Credential writes are disabled"); },
    } });
  registerBigModel(runtime);
  return runtime;
}
export async function listModels(provider?: string): Promise<{ provider: string; id: string; name: string }[]> {
  const runtime = await createModelRuntime();
  return runtime.getModels(provider).map(m => ({ provider: m.provider, id: m.id, name: m.name }));
}
export function createPiRuntimeFactory(apiKey: string): RuntimeFactory {
  if (!apiKey.trim()) throw new Error("The explicitly selected API key environment variable is empty");
  return async options => {
    const runtime = await createModelRuntime(options.model.provider, apiKey);
    const auth = await runtime.getAuth(options.model.provider, { apiKey });
    if (auth?.auth.apiKey !== apiKey) throw new Error("This provider requires configuration beyond the MVP API-key interface");
    return createPiRuntime(options, runtime);
  };
}
/** Injecting a runtime allows offline SDK integration tests without changing the production loop. */
export async function createPiRuntime(options: Parameters<RuntimeFactory>[0], modelRuntime: ModelRuntime): ReturnType<RuntimeFactory> {
  const model = modelRuntime.getModel(options.model.provider, options.model.modelId);
  if (!model) throw new Error("Configured provider/model is not in the configured review catalog; no fallback is allowed");
  const settingsManager = SettingsManager.inMemory();
  const allowlist = new Set(options.tools.map(t => t.name));
  const structuralCapability = allowlist.has("graph_lookup") ? GRAPH_CAPABILITY_PROMPT : allowlist.has("search_entity") || allowlist.has("traverse_graph") ? LOCAGENT_CAPABILITY_PROMPT : undefined;
  const resourceLoader = new DefaultResourceLoader({ cwd: options.runDir, agentDir: options.runDir, settingsManager,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    systemPromptOverride: () => BASE_SYSTEM_PROMPT + (structuralCapability ? "\n" + NAVIGATION_POLICY_PROMPT + "\n" + structuralCapability : ""),
    appendSystemPromptOverride: () => [], extensionFactories: [createReviewExtension(allowlist)] });
  await resourceLoader.reload();
  // Opening an exclusively created empty file sets Pi's flushed state via its public API.
  // No synthetic assistant message, SDK patch, or second conversation log is needed.
  const file = join(options.runDir, "session.jsonl"); closeSync(openSync(file, "wx", 0o600));
  const manager = SessionManager.open(file, options.runDir, options.repositoryPath);
  // Pi appends cwd to custom prompts. A/B runs use the same isolated state cwd so
  // random run IDs cannot silently change the system prompt between arms.
  const result = await createAgentSession({ cwd: options.evaluation ? options.stateDir : options.runDir, agentDir: options.runDir, modelRuntime, model,
    sessionManager: manager, settingsManager, resourceLoader, noTools: "builtin", tools: [...allowlist],
    customTools: options.tools.map(t => ({ name: t.name, label: t.name, description: t.description, parameters: t.schema as TSchema, executionMode: "sequential" as const,
      async execute(_id, params) { const value = await t.execute(params); return { content: [{ type: "text" as const, text: JSON.stringify(value) }], details: value }; } })) });
  const session = result.session;
  const journal = new PiSessionJournal(manager, { durable: true, onFailure: () => { void session.abort().catch(() => undefined); } });
  try {
    if (result.extensionsResult.errors.length) throw new Error("Review extension failed to initialize");
    await session.bindExtensions({ onError: () => { void session.abort().catch(() => undefined); } });
    if (JSON.stringify(session.getActiveToolNames().sort()) !== JSON.stringify([...allowlist].sort())) throw new Error("Unexpected active tool set");
    journal.checkpoint();
  } catch (error) { session.dispose(); throw error; }
  // Registered after AgentSession's awaited listener: native append has completed here.
  const unsubscribe = session.agent.subscribe(event => { if (event.type === "message_end" || event.type === "agent_end") journal.checkpoint(); });
  return { journal,
    configuration() { return { systemPrompt: session.systemPrompt, thinkingLevel: session.thinkingLevel, modelApi: model.api, modelBaseUrl: model.baseUrl, modelMaxTokens: model.maxTokens }; },
    async prompt(text, signal) {
      signal.throwIfAborted();
      let rejectAbort: (() => void) | undefined;
      const stop = () => { void session.abort().catch(() => undefined); rejectAbort?.(); };
      signal.addEventListener("abort", stop, { once: true });
      try {
        const prompting = session.prompt(text, { expandPromptTemplates: false });
        void prompting.catch(() => undefined);
        const cancelled = new Promise<never>((_, reject) => { rejectAbort = () => reject(signal.reason ?? new Error("Review cancelled")); });
        await Promise.race([prompting, cancelled]);
        signal.throwIfAborted();
        const last = [...session.messages].reverse().find(m => m.role === "assistant");
        if (!last || last.stopReason === "error" || last.stopReason === "aborted" || last.stopReason === "length") throw new Error("Model did not finish normally");
      } finally { signal.removeEventListener("abort", stop); journal.checkpoint(); }
    },
    abort: () => session.abort(), dispose() { unsubscribe(); session.dispose(); },
    usage() { const t = session.getSessionStats().tokens; return { input: t.input + t.cacheRead + t.cacheWrite, output: t.output, total: t.total }; },
  };
}
