# 实测记录 · 2026-09-20

## 图稳定性层 · 2026-09-22

工作基线为干净的 `feat/realgolden40-corpus` / `092ba457ad42f28a1bb11afa33b24a02fa66ce1f`；提示词所列 `0dd80b2` 不在本地对象库，本地 `main` 为 `8b170a0`，因此没有回退或覆盖当前两项 Graph harness 后续修正。修改前 `npm run verify` 退出码 0：142 core + 18 Pi + 38 Tree-sitter + 20 RealGolden，三组类型检查、demo、status 均通过；日志保存在 checkout 外 `../mergewarden2-graph-upgrade-baseline-verify.log`。

稳定性层保持原四类关系语义，迁移到 schema v3：分文件 checkpoint、不可变 generation、原子 manifest、ready/partial 分离、预算身份、确定性失败缓存、单 builder、损坏单次隔离、跨 generation 游标拒绝，以及单 review worker/只读句柄复用。取消路径在工具接纳时扣减预算，分别记录 requested/accepted/executed/rejected；deadline 后关闭接纳，并对 Pi abort、工具队列和 Graph worker 做有界清理。V8 old-generation 限制不再表述为进程总内存上限。

修改后完整 `npm run verify` 退出码 0：143 core + 18 Pi + 38 Tree-sitter + 20 RealGolden，0 failed / 0 skipped，三组类型检查、demo、status 均通过。新增故障测试验证完整文件容量部分发布、checkpoint 恢复不重提取、确定性 resolver 容量失败不重复、并发单 builder、损坏 generation 恢复、跨 generation 游标拒绝、冷构建取消后恢复，以及忽略 abort 的 runtime 仍在有界时间交付 cancelled 报告。日志保存在 checkout 外 `../mergewarden2-graph-upgrade-change-a-verify.log`。这一步没有运行付费模型，也不构成 Graph 审查质量证据。

## Golden r2 修订验证

用户授权 Agent 复核后修订为 `controlled-python-v02-20-r2`。本次先运行完整基线验证（152 passed），修改后 `npm run verify` 为 **101 core + 16 Pi + 38 grammar = 155 passed，0 failed，0 skipped**，三组类型检查、demo/status 通过。新增检查覆盖旧语料字节保留/版本混用拒绝、severity 与源码范围一致性，以及全部 revised base/head 的真实 grammar 解析。20 例均重新构建并核对固定 Git SHA，经真实 SnapshotStore 读取。没有执行被审 Python。

r2 离线 `--all` 已完成 **20 Text + 20 Graph，40/40 完整交付**，20 对 snapshot/有效配置一致，运行期间实现摘要未变。使用真实 Pi SDK 与 scripted-offline provider，空预测及 tokens 为合成，不能作为模型质量证据。日志与原始结果在仓库外 `../output/mergewarden-v02/golden-r2-verify.log`、`../output/mergewarden-v02/golden-r2-offline-all20/`。离线实验完成后仅校正一条 clean-none 的修订说明，不改变冻结 cases/hash 或可执行代码。本次新增改动的远端 CI 尚未执行。

旧 r1 按原字节保存在 `eval/corpora/controlled-python-v02-20/`，hash 仍为 `ef748a3c5916190857e5cb8e4753b23274f7206833ada681763dd328b2b44939`；r2 hash 为 `07491d7803a4a25ded06e58d4acfae052e6ec2bd7575cff9867c9adf0c9f62d9`。旧 raw/mapping/metrics 不改写。执行、评分、trace 匹配与审核工具支持显式 `--corpus`，错配版本会拒绝。

修订纠正 clean-guard 的正小数反例，明确三个 clean 的公开 API 边界，增强三个过易负例，将重复多跳单位转换替换为重试次数契约；10 项 defect 重评 medium，2 项 high 保留限定理由。[语料修订清单](../eval/corpus-revision.json) 逐例保存 lineage、SHA 和 Agent provenance。结论来自 Agent 静态推导，未冒充独立人工或 Python 执行验证。作者已见过 r1 结果，r2 不是独立 holdout；**r2 尚未跑真实模型 A/B，下文所有历史质量数据都属于 r1，不能转用为 r2 成绩。**

## v0.2 本地验收

修改前在完整 ReviewEngine 提交 5422ba7 跑过全部验证：**90 passed，0 failed，0 skipped**。随后开发分支安全快进到同树的 v0.1 合并提交 9258306；未改写 main。初始 6 处用户文档改动已另存仓库外补丁并保留。

图工程初次验收时 Windows / Node 24.12.0 的 `npm run verify` 退出码 **0**：核心/CLI/快照/引擎/评测 **77**、真实 Pi SDK **16**、真实 Python grammar/resolver/store/Golden **37**，共 **130 passed，0 failed，0 skipped**；三组类型检查、demo 和 status 均通过。原 90 项用例继续保留；声明限定名增加模块前缀，原 grammar 断言随 contract 更新。

新增验证包括同名隔离、嵌套/类作用域、遮蔽、六种 import、解析缺口、动态 receiver/metaclass；snapshot 隔离、确定性重建、损坏/未完成/版本过期/覆盖篡改缓存、分页、工作线程取消；Graph 错误阻止 completed clean、真实 Pi 工具循环、Graph 后伪造 source hash 仍须实际 read_source；Text-only 不建图；20 例 Git SHA 重建与快照读取、指标及一对一语义匹配。

### Tool trace 归因与人工复核工具

追加 22 项确定性测试后，本地完整 `npm run verify` 为 **99 core + 16 Pi + 37 grammar = 152 passed，0 failed，0 skipped**。提交 `eeaf508` 的 [四组远端 CI](https://github.com/takagibit18/mergewarden2/actions/runs/35510896211) 全部通过，每组执行完整验证。

测试覆盖活动 native JSONL 分支、损坏/孤立结果、实际 tool result 而非模型自述、同 snapshot 的 accepted source evidence、incoming caller 新颖性、既有文本线索、同批次预发读取、candidate/unresolved、失败查询、错误 hash 与范围、语义 mapping 后的两组对照，以及缓存/中断 usage。Graph 返回量保留精确 bytes/字符数；逐工具 GLM tokens 不可得，单列字符/4 粗估，不冒充真实账单用量。`incompleteUsage` 明确标记中断或缺失响应用量；aborted 响应返回零 usage 不能证明零消耗。

人工审核工具校验 corpus hash、20 个 case 与 base/head SHA、五项判断和本人声明。测试中的签署人是明确标记的 synthetic fixture，不是真实审核；后续用户改为委托 Agent 复核与修订，记录见 r2 小节，未升级人工 provenance。生成的 receipt 与所选 corpus 绑定，允许部分复核和争议状态，不改冻结答案。预测到 golden 的 Codex 语义匹配与人工标注审查是不同记录。

### 真实 Git Snapshot 图 smoke（受控源码，真实组件）

对冻结 `cross-key` base/head 提交调用真实 SnapshotStore → Tree-sitter → resolver → SQLite → graph_lookup/graph_neighbors → source。schema=2，resolver=python-scopes-2；2 eligible / 2 indexed / 0 parse-incomplete，1 resolved call / 0 candidate / 0 unresolved。查询正确返回 view.py 到 user.user_record 的调用及其源码范围。

一次本机测量：cold build **123.688 ms**，包含工作线程启动的 cold request **226.341 ms**，同 snapshot cache 的 warm request **104.739 ms**；两次 store query 合计 **2.094 ms**。warm request 包含线程启动、数据库及内容摘要校验，不能称为纯 SQLite 查询耗时。这只是两个文件的单次 smoke，不是大仓性能结论。

### Text-only / Text+Graph 工程实验

同一冻结 20 例、相同 snapshot/模型配置/提示词基线/120 秒/40 工具预算运行两组，**40/40 完整交付**；20 对实际配置全部一致（除 graph capability），运行前后实现摘要一致。输出逐例 raw、mapping、报告、原生 Pi JSONL 与汇总指标。此处使用真实 Pi SDK 和刻意空预测的 **scripted-offline provider**，没有调用真实模型。

| 指标 | Text-only | Text+Graph |
|---|---:|---:|
| 完整交付 | 20/20 | 20/20 |
| 工具调用 / Graph 调用 | 42 / 0 | 62 / 20 |
| 实测 review latency 总计 | 27,085.019 ms | 31,744.586 ms |
| 实测 graph build 总计 | 0 ms | 2,187.914 ms |
| **合成** input/output/total tokens | 620 / 310 / 930 | 820 / 410 / 1230 |
| 脚本空预测的 precision / recall / F1 | null / 0 / 0 | null / 0 / 0 |
| 脚本 clean FPR / PR recall / cross-file recall | 0 / 0 / 0 | 0 / 0 / 0 |

以上质量数字仅检验指标计算，不描述 GLM 或 Graph 的审查质量；token 也是替身设定值，不能用于真实费用比较。逐例 Graph diagnostics 在 raw/metrics 中保留，未仅保存均值。

Gold 在模型调用前冻结：12 defect（4/4/2/2 分类）、8 hard-negative clean；corpus SHA-256 `ef748a3c5916190857e5cb8e4753b23274f7206833ada681763dd328b2b44939`。案例与理由由本次实现预先编写，尚未经独立人工标注复核，不冒充真实公开项目缺陷历史。

原始本机产物位于仓库外 `../output/mergewarden-v02/`：`baseline-verify.log`、`verify-release-candidate.log`、`smoke-release-candidate/smoke.json`、`ab-release-candidate/{raw,mapping,metrics}.json`。不把这些任务报告和运行状态加入 Git。

### 远端 CI

实现提交 `7a38870` 已推送至 `feat/python-codegraph-evaluation`，并创建 [草稿 PR #3](https://github.com/takagibit18/mergewarden2/pull/3)，基于包含完整 v0.1 引擎的 `feat/immutable-snapshots`。该提交的 [push CI](https://github.com/takagibit18/mergewarden2/actions/runs/35500506139) 四组矩阵全部通过：Windows/Linux × Node 22.19.0/24.12.0，每组执行锁定依赖安装和完整 `npm run verify`。未改写 main，未 force push。

### 真实模型 CLI 主链路与最小 A/B

2026-09-20 使用用户配置的 MERGEWARDEN_API_KEY 调用 bigmodel/glm-5.3-flash；以下为真实请求和 SDK 用量，不是 scripted provider。运行时实现提交为 `f9921cc`（运行时源码与 `7a38870` 相同），实现摘要 `baeb01671d9f8f7c68085b4da5daa6eb67dc9a4eebbafc792520445788054dc8`。运行前后摘要一致，4 对配置审计全部通过；没有修改模型、提示词、预算或 frozen labels 迁就结果。之后只同步 CLI status 的验收元数据和文档。

正式 CLI 在冻结 single-zero 案例完成 review → immutable Snapshot → Pi/GLM → read_diff/read_source/search_text/graph_lookup/graph_neighbors → submit_review → JSON/Markdown 交付，退出码 0。run `11c6f5b3-52c6-461e-a910-e45ddfe7ecd9` 找到零除回归，9 次工具调用（3 次 Graph），92.709 秒；cold build 81.756 ms，warm request 77.559/77.597 ms。CLI history/show/evidence 重新读取成功，证据 SHA 与报告 hash 均通过，doctor 无遗留锁。独立 CLI smoke 使用 180 秒、40 工具预算，不混入以下 A/B 指标。

同 snapshot rerun `f34d2d89-5177-4ffc-b86f-a294cea04c80` 也以退出码 0 完成，新旧报告均可读取；耗时 63.355 秒，7 次工具调用（1 次 Graph）。缓存复用 build=0，warm request 74.018 ms。snapshot 均为 `599c1164aefdf426bae6b43d409248cf36ac9124e16adb00915537866bf9b9fc`。

A/B 使用原先冻结的 4 个 smoke 案例（single-zero、cross-key、alias-normalize、clean-guard），3 defect + 1 clean，每组 120 秒、40 工具预算，单次运行：

| 实测指标 | Text-only | Text+Graph |
|---|---:|---:|
| 完整交付 | 4/4 | 3/4 |
| TP / FP / FN | 3 / 0 / 0 | 2 / 0 / 1 |
| Finding precision / recall / F1 | 1 / 1 / 1 | 1 / 0.667 / 0.8 |
| clean PR false-positive rate | 0 | 0 |
| PR-level recall / cross-file recall | 1 / 1 | 0.667 / 0.5 |
| input / output / total tokens | 84,996 / 16,163 / 101,159 | 123,712 / 15,719 / 139,431 |
| 工具调用 / Graph 调用 | 40 / 0 | 47 / 10 |
| 总 review latency | 413.665 秒 | 419.512 秒 |
| 总 graph build latency | 0 | 377.966 ms |

Graph 组的 alias-normalize 在第 13 次工具调用 submit_review 时因把未修改文件列入 reviewedPaths 而收到 Unknown reviewed path，随后触及 120 秒上限。索引与 Graph 查询均成功，3/3 文件、1 resolved call；报告明确 partial（Review time budget exhausted），未伪装 clean，仍计入 FN 与完整交付率分母。两个 cross-key run 也曾触发相同提交校验，但均在预算内修正成功。保留这些失败和恢复记录，未重试后覆盖原结果。

Graph 组四个索引按案例分别为 indexed 1/2/3/2，resolved calls 0/1/1/1；parse-incomplete/candidate/unresolved 均 0。cold build 为 89.982–98.291 ms，warm request 为 71.224–85.717 ms，仍包含工作线程启动和缓存校验。Text-only 未构图；其零诊断数表示未索引，不表示没有依赖。

五个已提交 finding 由本次 Codex 逐条比较 claim/trigger/impact 与冻结源码后作语义匹配，**不是独立人工复核**；两个 finding 的预测 severity 为 medium、gold 为 high，现有指标衡量缺陷身份而非严重性一致率。全部报告重开与源码证据复核通过。此次小样本中 Graph 完成率和 recall 更低、token 更多，**未观察到增益，也不足以推断普遍优劣**。

仓库外真实产物：`../output/mergewarden-v02/live-smoke-20260920/{raw,mapping,metrics,e2e-audit}.json`，以及 `cli-live-20260920/e2e-audit.json` 与各 run 原生 JSONL/报告。原 20-case 离线数据完整保留，不能与这组真实用量混合。该次 smoke 之后的完整真实集见下；独立人工标注复核、追加重复及公开项目评测仍待完成，未打 v0.2.0 标签。

### 完整 20-case 真实 GLM A/B 与工具归因

保持 bigmodel/glm-5.3-flash、Pi 0.84.1、120 秒、40 工具预算和原 prompt/corpus，顺序执行每例 Text-only 后 Text+Graph，共 **20 + 20 次真实模型调用**。执行的是 `cb63eff` 的独立冻结源码副本，运行时摘要 `0a8250945ac4deac9df23865640c872f8b5bd80b68eedf5d00b3fbdfca30f0a0`；运行前后不变，20 对实际配置审计全部通过。新的 trace/人工审核代码在另一个 checkout 中开发，仅参与事后分析，没有进入模型循环。

复用原 state/repositories 的真实路径，先前 4 个 smoke 案例的 snapshot 和有效配置均再次一致。没有覆盖旧 run，也没有为分数修改 case。40/40 报告重开通过，22 个 accepted finding 的 62 条 immutable source evidence 全部重新核验；40/40 native trace 可分析，逐响应 usage 合计与 manifest 一致。

| 指标 | Text-only | Text+Graph |
|---|---:|---:|
| 完整交付 | 18/20 | 17/20 |
| TP / FP / FN | 11 / 0 / 1 | 11 / 0 / 1 |
| Finding precision / recall / F1 | 1 / 0.917 / 0.957 | 1 / 0.917 / 0.957 |
| Clean PR FPR / PR recall | 0 / 0.917 | 0 / 0.917 |
| Cross-file recall | 6/7 | 7/7 |
| 已报告 input / output / total tokens | 371,556 / 60,039 / 431,595 | 570,895 / 73,312 / 644,207 |
| 其中 cacheRead tokens | 182,592 | 424,064 |
| 工具调用 / Graph 调用 | 183 / 0 | 231 / 50 |
| 总 review latency | 1,668.468 秒 | 1,788.131 秒 |
| 总 graph build latency | 0 | 1,873.905 ms |
| 用量可能不完整的审查 | 2 | 3 |

上述质量分数仍基于**未经独立人工复核的原始标签**；预测↔golden 由 Codex 比较 claim/trigger/impact 后匹配，不是用户的人工审核。两组均无 clean finding，但 Text clean-guard 为 partial，不能用 FPR=0 宣称所有 clean 审查完成。所有失败保留在分母中。

5 次 partial 均为时间预算耗尽：Text 的 cross-sentinel（无 finding）、clean-guard（已接受空结果）；Graph 的 cross-optional、multihop-units（各有 1 个已接受 finding）、scope-boundary（无 finding）。Graph 查询无故障；partial 中已经接受并持久化的 finding 仍按实际语义计 TP，完整交付另计。两组各发生 10 次被拒绝的 submit_review，原始失败和恢复均保留。

SDK 已报告总 tokens 的 Graph 增幅为 49.3%，**不能当作费用增幅**：input 包含不同量的缓存读取，价格未知；这 5 次中断的最后响应均为 aborted/零 usage，可能遗漏供应商消耗，不填伪造估算。两组都完整交付的 15 对（仅描述成功配对成本，不改变总质量分母）为 320,800 / 453,929 已报告 tokens，均无中断 usage 缺口。

| Trace 指标 | 实测 |
|---|---|
| 使用 Graph 的审查 | 19/20；alias-normalize 没有调用 Graph |
| 首次 Graph 调用位置 | 平均第 7.421 个 tool；序号 5–15 |
| Lookup 成功 / 非空命中 | 29/29 / 29/29 |
| Lookup → neighbors | 13/29，44.8% |
| 非空 neighbors → 后续 read_source | 1/12，8.3% |
| 新 caller 读取 / graph_assisted finding | 0 / 0 |
| Graph 组 finding 归因 | 11 text_only / 0 graph_assisted / 0 ambiguous |
| Graph 返回量 | 51,823 UTF-8 bytes / Unicode 字符；逐工具精确 GLM tokens 不可得 |
| 字符/4 粗估 | 逐 run 向上取整后合计 12,962；不是 GLM tokenizer 或账单 tokens，不包含上下文重复发送 |
| search_text：Text / Graph | 62 / 58 |
| read_source：Text / Graph | 70 / 70 |

唯一 neighbors→read_source 转化出现在 scope-boundary，读取的是已读文件，最后没有 accepted finding。cross-sentinel 虽然只有 Graph 组交付了 finding，但 caller 已由 search_text 发现，lookup 只返回已读函数，neighbors 发生在 caller 读取之后，因此归为 text_only，不能据其跨文件 recall 差异声称 Graph 新发现。multihop-units 的 Graph 返回已读 adapter，后续 service 仍由文本搜索找到。Graph 大多用于既有线索确认；增加 50 次图调用，只少了 4 次搜索、没有减少源码读取，且另多 2 次 diff 调用，净增加 48 个 tool。图构建耗时本身不足以解释全部模型耗时差异。

19 次实际使用 Graph 的审查合计 33 eligible / 33 indexed files、0 parse-incomplete、14 resolved / 0 candidate / 8 unresolved calls；均在逐 case 结果中保存。不调用图时记录的零不表示无依赖。16 次 cold build 为 96.541–157.832 ms（均值 117.119）；cold request 均值 205.656 ms。34 次 warm request 为 82.642–117.695 ms（均值 99.755），包含线程启动和完整性校验；store query 合计 42.938 ms。三个既有 snapshot cache 实际复用，其余按需构建。

单次、固定组顺序和供应商缓存均限制因果解释；同一主机上也运行过后处理开发和本地验证，不是隔离负载的性能基准。此次**未观察到严格 Graph-assisted 增量发现**，不宣称普遍无效。未追加收费重复；后续 Agent 复核发现 r1 标签问题并另冻 r2，不能再把原 gold 称作已验证正确，原分数仅保留历史含义。

全部真实产物位于仓库外 `../output/mergewarden-v02/live-full20-20260920/`：raw、mapping、metrics、trace-analysis、execution-context、e2e-audit、latency-summary、complete-pair-cost 和原生会话。人工审核页在 `../output/mergewarden-v02/human-review-20/review.html`，不展示模型答案；经本人填写并校验后才生成审核 receipt。Graph/parser/resolver 和模型 prompt 未因本次结果修改。

## v0.1 离线实现验证

历史基线：Windows，Node.js 24.12.0、npm 11.6.2、Git 2.53.0。修改前完整 `npm run verify` 退出码 0：

| 检查 | 结果 |
|---|---|
| 核心、快照、引擎和 CLI | 71 passed / 0 failed / 0 skipped |
| Pi 原生 SDK | 14 passed / 0 failed / 0 skipped |
| Python 真 grammar | 5 passed / 0 failed / 0 skipped |
| 类型检查 | 核心、Pi、Tree-sitter 全部通过 |
| demo / status | 成功；明确 synthetic 和真实模型未验收 |

共 **90 项通过**，保留原有 51 项，新增 39 项。没有真实模型调用。

新增国内 BigModel GLM-5.3-Flash 配置；3 项离线测试验证注册、实际 Pi HTTP 请求编解码/工具回合和模拟 401，无真实智谱调用。用户配置步骤见 [真实模型验收指南](LIVE_ACCEPTANCE.md)。

### 新增覆盖

- 12 个快照用例：提交身份、原快照内容、部分暂存、中文重命名/删除、显式未跟踪文件、忽略、冻结竞争、分页/范围、符号链接/二进制、内容/覆盖篡改、目录隔离、原子写失败、BOM/CRLF、unborn HEAD。
- 15 个引擎用例：有证据建议、空差异、缺失最终提交、未读/部分读取/错误 hash/重复提交、部分覆盖、模拟凭据/供应商错误、取消、时间/工具预算、业务日志失败、JSON/Markdown 写失败、交付清单前中断、原快照新 run、并发锁及产物篡改。
- 4 个 Pi 用例：首条 assistant 前持久化及恢复、截断日志后永久失败、**真实 SDK 循环连接离线 provider 替身并交付报告**、原生消息写失败阻止工具执行。
- 1 个报告呈现用例：模型提供的 Markdown 图片、链接和 HTML 均作为文本转义，防止报告打开时加载外部资源。
- 4 个 CLI 用例：帮助/状态、缺少明确凭据、历史/诊断、重复选项及密钥不回显。

错误凭据测试使用模拟异常；还没有向真实供应商发送错误密钥。Pi 循环测试证明业务接线和 SDK 行为，不证明模型质量。报告中断测试是确定性故障注入，不是物理断电或所有文件系统耐久性测试。

### 已准备，未执行

`fixtures/live-v01/fixture.json` 在真实调用前标注了一个 Python 缺陷/修复 smoke 用例；已在本地 `../mergewarden2-live-fixture` 生成三次 Git 提交。只创建样例，未调用模型。

下一步由用户按 [真实模型验收](LIVE_ACCEPTANCE.md) 配置供应商、模型及环境变量。在完成实际审查、证据核对与报告重开前，不打 v0.1.0 标签。

## CI

`.github/workflows/core.yml` 运行 Windows/Linux × Node 22.19.0/24.12.0 的相同验证流程。当前 PR 以其对应的 [GitHub Actions](https://github.com/takagibit18/mergewarden2/actions) 结果为准；本地 Windows 通过不代替 Linux 或 WSL。

M0 历史基线 51 项及首次四组矩阵通过记录：[M0 CI](https://github.com/takagibit18/mergewarden2/actions/runs/35485711680)。

## 依赖和边界

依赖与 lockfile 本轮未更换：Pi 0.84.1；web-tree-sitter 0.27.0；Python grammar 0.25.0、ABI 15，来源/hash 见 grammar lock。

M0 发现的首条 assistant 前延迟持久化已通过公开 API 的独占空文件初始化解决，原行为测试保留。当前强制同步及校验，不宣称 exactly-once 或数据库事务。

v0.2 已实现 Python resolver/SQLite 与 20 个受控案例，BigModel GLM-5.3-Flash 的真实 CLI smoke、4-case 与完整 20-case A/B 详见上方实测；其他供应商未实测。VS Code/VSIX、Windows/WSL 产品验收、独立人工黄金集及 3 对公开项目评测尚未完成。未发布 Marketplace、公共许可证或版本标签。


## LocAgent mechanism challenge · 2026-09-21

实验基线 93d9da8，官方参考 4935b557326c154bad8e8dcf3747cc8d32d1f387。底层 Graph/resolver、r2 corpus、BASE_SYSTEM_PROMPT 和 finding/report 协议保持冻结。八例（5 defect、3 clean）与轮换顺序在新调用前登记；正式 24 次运行固定在 c9584d0，GLM-5.3-Flash、Pi 0.84.1、120 秒、40 tools、8192 max tokens、实际 thinkingLevel=medium。八组三臂实际配置一致（仅能力描述不同），执行前后指纹相同。

| 实测 | T0 | G0 | G1 |
|---|---:|---:|---:|
| TP / FP / FN | 5 / 0 / 0 | 5 / 0 / 0 | 4 / 0 / 1 |
| Precision / Recall / F1 | 1 / 1 / 1 | 1 / 1 / 1 | 1 / 0.8 / 0.889 |
| Clean FPR | 0/3 | 0/3 | 0/3 |
| 完整交付 | 7/8 | 4/8 | 5/8 |
| 工具调用 | 85 | 106 | 92 |
| search_text / read_source | 25 / 37 | 28 / 40 | 26 / 40 |
| Graph/retrieval 调用 | 0 | 15 | 6 |
| Graph/retrieval 返回 bytes | 0 | 17194 | 27191 |
| Graph-assisted / novel→source | 0 / 0 | 0 / 0 | 0 / 0 |
| Review latency 总计 ms | 755567 | 846911 | 886303 |

各 arm 均存在中断 usage，因此完整 input/cacheRead/output/total 合计均为 null，不能当零消耗；逐例 SDK 已报告部分仍保留。14 条 accepted finding 的源码 SHA 与 24 份报告独立核验通过；语义匹配由 Codex 基于冻结源码与实际 claim 复核，不冒充独立人工标注。accepted partial finding 保留计分，失败仍在交付分母。G1 的 alias 候选描述正确 bug，但 reviewedPaths 含未变更文件而被拒绝，超时前未修正，最终记 FN。

G1 的 3 次 SearchEntity 均命中，entity/content BM25 各参与 4 个查询阶段，另有 1 次非法 root 的 BM25 候选提示；3 次 traversal 请求深度大于 1，但没有首次返回于深度 >=2 的新实体。真实两跳能力在独立 snapshot smoke 中验证：policy.attempts ← adapter.total_attempts ← service.schedule；3 files、0 parse-incomplete、2 resolved、0 candidate、2 unresolved。该无模型 smoke 的 build 109.569 ms、cold request 238.489 ms、warm requests 130.782–136.405 ms，非大仓性能结论。

首次 ff8c8e1 尝试因遗漏参考 invalid-root BM25 hints 而中断，保留 6 份报告和 1 次未完成尝试，未与正式 24 次混算。正式运行后单独修复大量 warnings 的小输出上限反例，并收紧 hint 曝光的 trace 归因；没有替换模型运行。v2 派生分析不改 raw/native，24 次归因结果全部不变。初次 155 项基线验证及后续本地/CI 日志均保留在仓库外；166 项最终确定性测试覆盖这些边界。

原始、mapping、integrity、v1/v2 分析在仓库外 ../output/locagent-replication/challenge-c9584d0/；机器可读 [fidelity](../eval/locagent/locagent-replication-fidelity.json) 与 [冻结协议](experiments/LOCAGENT_REPLICATION.md) 记录适配。内容分块/预览、JS Snowball、fuzzy 顺序、索引生命周期等不等同原版；这是机制实验，不是论文指标复现。未达到 Stage D 门槛，未执行 20×3，不据此断言 Graph 在真实大仓库无价值。

RealGolden 的确定性验证入口仍为 `npm run verify`。新增检查覆盖 raw Git 父链、缺失对象、真实 SnapshotStore 分页、origin/快照身份、24/16 配额、冗余 approved pool、公开任务隔离、完整 Pi prompt、批跑失败保留/续跑和开放标签 precision bounds。它们不执行目标 Python，也不调用模型。真实 reserve pilot 的 native session、report、锁和成本统计由批跑输出目录保留；正式质量必须另行裁定，不能由静态构图或脚本 provider 成功推断。

RealGolden 模型预算测试通过真实 Pi 请求构造器和离线 HTTP 截获，验证三组实际发送相同的 `max_tokens` / `reasoning_effort`，并核验产品默认 catalog 不变。Pi 客户端 thinking level 与服务端推理档位分别记录；不能仅凭 `medium` 元数据推断服务端收到该设置。预算变更须使用新 reserve 实验锁，正式实验必须沿用已通过 pilot 的模型预算。

## Graph harness / tool-selection fairness 修正 · 2026-09-21

修正前，BASE 使用 `immutable-source tools` 措辞；G0 capability 只笼统描述 Graph，没有写明 `graph_lookup` → `graph_neighbors` 的组合；G1 虽写明 upstream/downstream，但两个 Graph arm 没有共享的结构导航选择政策。同时，任一 Graph error/not_indexed 都会参与 business completion 判定，导致调用可选工具的 G0/G1 承担 T0 不存在的降级风险。旧 reserve v4 的 18 次真实运行中 G0/G1 均为 0 Graph calls；这是旧 harness 结果，不能用来冻结新实现。

修正后，BASE 改为中性 `immutable repository tools`。G0/G1 共享同一 `NAVIGATION_POLICY_PROMPT`：只在活动工具集提供结构能力时，说明 untouched-context trigger、caller/reference/consumer/dependency 发现、anti-confirmation 和 text/source fallback。G0 capability 明确 `graph_lookup` 先精确解析 symbol，再用 `graph_neighbors` 做一跳关系；G1 capability 只保留 `search_entity` / `traverse_graph` 的检索和方向语义。所有描述均保留 `read_source` 证据边界，未强制调用 Graph。

completion 现只依赖最终提交、完整差异覆盖和无 model/timeout/tool-budget 错误等既有业务门槛。Graph/retrieval 失败保留 tool error/warning、报告限制说明与 `metrics.navigation.{attempted,degraded,errors}`；成功 text/source fallback 的 finding 和 zero-finding review 可 completed，而无 submit 或 timeout 仍是 partial。正式批跑使用 `first_attempt`，reserve 仍可 operational retry。盲审包确定性排除 arm、run key、Graph metrics 和 trace，私有映射绑定 prediction/gold hash。

修改前完整 `npm run verify` 通过：核心 135、Pi 18、Tree-sitter 38、RealGolden 构造 20，另有全部类型检查、demo 与 status。修改后完整验证同样通过：核心 142、Pi 18、Tree-sitter 38、RealGolden 构造 20，0 failed/0 skipped，三组 TypeScript 检查、demo 和 status 全部成功。新回归覆盖 prompt 组合、真实 Pi active tools/工具描述、Graph 失败后有 finding/无 finding fallback、无 submit、timeout、T0 不变、Graph 不能成为 evidence、formal first-attempt 及盲审隔离。真实 reserve/formal 冻结产物保留在 checkout 外，不改写旧锁或历史结果。
