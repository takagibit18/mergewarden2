# Python retrieval evaluation

这是同一个 ReviewEngine 的内部工具消融，不是产品模式。`cases.json` 固定 20 个受控案例：4 单文件、4 跨文件、2 多跳、2 import/scope 缺陷，8 个 hard-negative clean。每例保存仓库逻辑身份、真实 Git base/head SHA、源码、定位、严重性、行为和人工可读理由。理由在模型调用前编写，但尚未独立人工复核；不要把它描述为公开项目真实缺陷黄金集。

`corpus.lock.json` 固定字节摘要。`materialize.mjs` 只用 Git 对象命令重建相同提交，不执行 Python，不 checkout hooks。修改预期答案必须独立审议和升级 corpus；不能为当前预测改答案。

## 执行

先安装锁定依赖并运行 `npm run verify`。输出目录必须在本仓库之外且每次新建，状态与被审 fixture 也是并列目录。

```sh
npm run eval -- --offline --all --output /outside/checkout/offline-run
npm run graph:smoke -- /outside/checkout/graph-smoke
npm run eval -- --live --output /outside/checkout/live-smoke
npm run eval -- --live --all --repeats 3 --output /outside/checkout/live-repeat
```

默认 smoke 固定 4 例，可用 `--cases single-zero,cross-key` 选择子集；`--all` 跑 20 例。`--offline` 使用真实 Pi SDK 与刻意提交空 finding 的脚本 provider，token 是合成值，不能作为模型质量/成本证据。`--live` 从 `experiment.json` 指定的环境变量读取密钥，当前固定 bigmodel/glm-5.3-flash、120 秒、40 次工具预算。密钥不进入配置/结果文件。

两组共享相同 snapshot 与 final_only/source evidence/schema/report delivery。v0.1 system prompt 保持冻结，Graph 组只增加能力说明；Pi 会附加 cwd，所以 A/B 固定相同仓库外 cwd。每组记录有效 system prompt、thinking level、API、endpoint、maxTokens、包锁 hash，逐对比较。运行前后核对整个引擎、适配器、schema 和 eval 源码摘要；实验途中修改实现会阻止有效比较。重复运行交替组顺序；Graph 缓存可在同 snapshot 后续运行复用，需按 cold/warm 指标解释成本。

## 原始结果与匹配

`raw.json` 保存逐例报告、交付状态、run manifest、实际 tokens、工具调用、review/build/query latency、Graph 覆盖与版本配置。原生 Pi JSONL、源码快照与报告保存在 `state/`。review latency 不包括创建 fixture 和预先冻结 snapshot 的时间；Graph warm request 含线程启动及缓存完整性核验，queryMs 单独记录。

`mapping.json` 给出逐个 prediction 的待判定项。审核 claim/trigger/impact 与 golden behavior 是否相同，填写 `goldenId`（误报用 null）、rationale、reviewer，并把 status 设为 complete。禁止只因行号相交判为匹配；一个 golden 最多匹配一个 prediction，重复 finding 按额外预测处理。

```sh
npm run eval -- --score --output /outside/checkout/live-smoke --mapping /outside/checkout/live-smoke/mapping.json
```

指标包含 finding precision/recall/F1、clean PR FPR、PR-level recall、cross-file recall、complete delivery rate；输入/输出/总 tokens、工具/图工具次数、review/build latency；逐例 indexed/parse-incomplete/resolved/candidate/unresolved 数量。无分母或缺少用量为 null；失败/partial 不从 recall/交付分母移除。保留 raw、mapping 和 perCase，不能只展示汇总。clean FPR 的分母是所有尝试的 clean 案例，必须与完整交付率一起读。

schema 位于 `schemas/golden-case.schema.json` 和 `schemas/evaluation-result.schema.json`；CI 验证 corpus hash、20 例 SHA 重建、真实冻结边界和指标算术。小样本、脚本 smoke 和“成功构图”都不能证明 Graph 带来审查增益。
