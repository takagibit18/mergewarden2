# Python retrieval evaluation

这是同一个 ReviewEngine 的内部工具消融，不是产品模式。`cases.json` 当前为 **controlled-python-v02-20-r2**：4 单文件、4 跨文件、2 多跳、2 import/scope 缺陷，8 个 clean 对照。每例保存仓库逻辑身份、真实 Git base/head SHA、源码、定位、严重性、行为和人工可读理由。r2 经用户授权的 Agent 静态复核修订，作者已看过 r1 模型结果；在 r2 模型调用前冻结，不是独立人工标注或未见结果的 holdout。

`corpus.lock.json` 固定字节摘要。`materialize.mjs` 只用 Git 对象命令重建相同提交，不执行 Python，不 checkout hooks。修订必须有明确源码依据、授权和新 corpus 身份；不能为当前预测改答案。

## Corpus 版本与修订边界

旧版 [controlled-python-v02-20](corpora/controlled-python-v02-20/cases.json) 和 lock 按原字节归档，SHA-256 为 `ef748a3c5916190857e5cb8e4753b23274f7206833ada681763dd328b2b44939`。历史 GLM 20+20 结果只属于该版本。当前 r2 hash 见 [lock](corpus.lock.json)，逐例 predecessor/SHA、修改理由、severity 理由及 Agent provenance 见 [修订清单](corpus-revision.json)。这份清单是语料元数据，不是人工审核 receipt。

| r2 修订 | 源码层面的约定 |
|---|---|
| clean-guard | 保留正小数输入；两个版本的调用者都先把正数 count 归一化到至少 1，再移除 helper 的重复保护。ratio(1,0.5) 两边均为 1.0 |
| clean-key-migration / clean-alias / clean-conversion | 公共入口、输入域和私有 helper/alias 在两个版本源码中明确，不能只把范围写在模型看不到的 gold 中 |
| clean-shadow / clean-empty / clean-default | 分别检查局部遮蔽、调用者非空保护、始终传参使私有 mutable default 不被使用；替换原来简单的等价表达式改写 |
| multihop-units → multihop-retry | 换成两跳重试次数契约，避免重复一份相同单位转换 defect；旧 case 仍在 r1 |
| 12 个 defect 的 severity | 10 项 medium；错误删除与显式输出集合反转 2 项暂定 high；逐例理由不推断不存在的生产事故或安全事件 |

这些仍是每例 1–3 文件的受控样本。clean-alias 较容易，不能宣称 8 个 clean 都是高难 hard negative；cross-units/clean-conversion 有意成对，样本并非完全独立。r2 的源码行为目前基于静态推导，grammar/Snapshot/离线 Pi 验证不等于执行 Python 或真实模型质量验证。

执行、评分、trace 匹配和人工审核工具均可用 `--corpus DIRECTORY` 显式选择包含 cases/lock 的目录，默认当前 r2。旧结果配上 r2 标签会拒绝；不得把历史分数改称 r2 分数。例如重新核验旧评分：

```sh
npm run eval -- --score --corpus eval/corpora/controlled-python-v02-20 --output /outside/checkout/old-run --mapping /outside/checkout/old-run/mapping.json
```

历史 trace 或审核页同样附加 `--corpus eval/corpora/controlled-python-v02-20`。r1 的 dispute 不能因 r2 修订被抹除；若比较两套语料，需明确样本与源码不同，不能把分数变化归因于 Graph。

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

## 独立人工复核

```sh
npm run eval:human-review -- --output /outside/checkout/human-review
npm run eval:human-review -- --validate /path/to/golden-human-review.json --output /outside/checkout/review-receipt
```

第一条命令生成离线 `review.html` 与待填 JSON。审核人先读逐文件 base/head，再展开既有标注，独立检查 bug、clean、expected behavior/输入域、severity 和 Graph 设计偏向。页面不显示模型预测或 A/B 结果；姓名、独立性声明、人工填写声明、五项判断与理由均由本人填写。未填项保持 pending，不能由 Agent 补成“人工已审核”。浏览器保存草稿并导出 JSON，不发送网络请求。

第二条命令验证 corpus hash、20 个 case 身份和 base/head SHA，生成 `reviewed-provenance.json`。其中每例有效 `annotationProvenance.status` 为 pending_human_review、human_reviewed_accepted 或 human_reviewed_disputed；保留签署人、日期和原始理由。软件只能验证声明与数据结构，不能自行证明审核人的身份。部分复核不会升级未审案例；不同意任一标签/行为/severity 或仍有偏向疑问时，必须标记 needs_revision/reject，不能静默接受。

此 receipt 是绑定所选 corpus 的人工来源记录，不修改冻结 case/答案/lock。r2 的 `annotationProvenance` 如实描述 Agent 编写和复核来源；`corpus-revision.json` 保存 Agent 状态，不可冒充这里的人工声明。只有实际人工作答才能生成 human_reviewed 状态。后续再次修订须另建版本，旧实验继续引用原 hash。schema 见 `schemas/human-review.schema.json`。

## 工具轨迹与 Finding 归因

```sh
npm run eval:traces -- --output /outside/checkout/live-run
npm run eval:traces -- --output /outside/checkout/live-run --mapping /outside/checkout/live-run/mapping.json
npm run eval:traces -- --output /outside/checkout/live-run --mapping /outside/checkout/live-run/mapping.json --human-review /path/to/golden-human-review.json
```

分析器只读原生 Pi JSONL 的最后活动分支中的 toolCall/toolResult，不采信模型自述，也不改 prompt、finding 协议或源码 evidence。验证报告和 immutable evidence 后，生成 `trace-analysis.json`：每次调用的 ID/序号/原生 entry、状态、逐 finding `discoveryPath` 和可追溯链均保留。分析器源码 hash 与 JSONL hash 一并记录。`--partial` 仅生成明确标记 provisional 的中途分析；不会把未完成实验当成正式结果。schema 见 `schemas/trace-analysis.schema.json`。

- `graph_assisted`：已解析的 incoming CALLS/REFERENCES 返回此前未被文本工具暴露的 caller 路径；收到该结果后，模型另行发出 read_source 覆盖其调用位置；成功接受的 finding evidence 包含同一 snapshot/head 的该位置与实际读取的 SHA。
- `text_only`：最终证据在 Graph 之前已读，或没有观测到相关 Graph 返回位置引出这些证据。
- `ambiguous`：相关 Graph 与文本发现重叠、关系不确定、同一批次提前发出源码读取，或 trace/成功提交/源码证据链不足。Graph 查询失败不自动转成 text_only。

为避免夸大增益，采用保守的文件路径级新颖性：之前在任一 revision 的 read_source/read_diff/search_text 暴露过 caller 路径，即不授予严格 Graph 首次发现归因；Graph 后、源码读取前出现竞争性文本发现也同样处理。这可能低估同文件内新 symbol 的贡献，因此同时保留 ambiguous 与完整链。outgoing 关系当前只带 source provenance，不能猜测 callee 范围以强行归因。

输出包含 Graph 调用数、首次调用序号、lookup 成功率与非空命中率、lookup→neighbors 和 neighbors→read_source 转化、逐例 search_text/read_source 差值。序号按模型发出的调用顺序计，包含拒绝及无返回的调用；成功率分母是全部 lookup，转化率分母分别是命中的 lookup、成功非空的 neighbors。neighbors conversion 要求读取返回的 provenance 位置，不等同于新发现；同批次预发调用不算转化。重复 lookup 的后续 neighbors 只归给最近一个返回匹配 ID 的 lookup。

Graph 返回量记录精确 UTF-8 bytes/Unicode 字符数；SDK 未提供逐 tool 的 GLM token 数，因此 `graphResponseTokens=null`。另列字符数/4 向上取整的粗估，明确不是 GLM tokenizer、账单 token 或上下文重复发送成本。真实 input/output/total tokens 仍取模型 SDK usage，不用粗估替代。

逐 run 的 `usage` 仅统计活动分支中的供应商/SDK 用量元数据，input 包含 cacheRead/cacheWrite；保留缓存用量、interrupted/missing response 数以及 `incompleteUsage`。超时流可能以 aborted 和全零 usage 结束，这不是零消耗的证据。汇总 `runsWithIncompleteUsage` 显式暴露缺口；raw 中实测 tokens 是 SDK 已返回的部分，不能当完整供应商账单。分析不读取或输出模型思考内容。

传入已完成语义复核的 mapping 后，可列出 **graph_assisted 且同 case/repeat 的 Text-only 没有已接受同一 golden 的 finding**，同时保留 Text-only 是否完成。缺少 mapping 时该结果为 null，不能靠标题相似或行号重合猜测。此指标证明的是本次可观察发现路径，单次配对仍不能证明反事实因果或普遍收益。

`--human-review` 仅接受实际审核人填写的原始导出，校验后将逐例审核 provenance 附入分析结果。未提供时明确记录 pending_independent_human_review；Agent 对预测与原 gold 的语义匹配不能代替人工审核，质量分数须按尚未复核的标签解释。
