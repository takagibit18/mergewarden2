import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
/** User-selected mainland BigModel endpoint; never reuse the overseas/Coding Plan route. */
export function registerBigModel(runtime: ModelRuntime): void {
  runtime.registerProvider("bigmodel", {
    name: "智谱 BigModel", api: "openai-completions", baseUrl: "https://open.bigmodel.cn/api/paas/v4/", authHeader: true,
    models: [{
      id: "glm-5.3-flash", name: "GLM-5.3-Flash (BigModel)", reasoning: true, input: ["text"],
      // Conservative application limits, not a claim about the provider's maximum context.
      contextWindow: 65_536, maxTokens: 8_192,
      // Required SDK metadata only. MergeWarden reports tokens, never these unknown prices.
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false,
        maxTokensField: "max_tokens", thinkingFormat: "zai" },
    }],
  });
}
