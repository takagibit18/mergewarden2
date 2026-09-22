# 当前实现状态 · 2026-09-21

RealGolden 三臂 harness 已分离“审查完成”与“结构导航可用性”：G0/G1 共享同一中性 `NAVIGATION_POLICY_PROMPT`，各自 capability 只说明工具名、调用关系和机械语义；T0 不接收该 system policy 且仍只暴露四个文本/提交工具。Graph/retrieval 错误保留显式 tool error/warning、`metrics.navigation` 诊断和报告限制说明，但不再单独 poison 已满足差异覆盖、源码证据、最终提交与交付门槛的业务完成态。正式 RealGolden 锁固定 `first_attempt`，reserve 保留 operational retry；盲审包将 arm、run key、Graph 调用与 trace 保留在私有映射中，不展示给裁定者。

实验性 LocAgent retrieval scaffold 已接入同一 ReviewEngine，限定为内部 T0/G0/G1 配置，产品工具默认不变。固定 r2 的 8-case × 3-arm GLM 对照已完成，完整交付 T0 7/8、G0 4/8、G1 5/8；按 accepted findings 评分 TP 为 5/5/4，FP 均为 0。Graph-assisted 和 novel→source 转化均为 0，未启动 full 20-case。原始运行固定在 c9584d0，后续边界/trace 修正单独记录；[协议与适配边界](experiments/LOCAGENT_REPLICATION.md)。下文 r1/r2 初次验收数字为历史阶段记录。

v0.2 的 Python 图与评测工程路径已接在 v0.1 上，修订 Golden 前本地 152 项测试和 Windows/Linux × Node 22/24 远端 CI 已通过。真实 GLM CLI 审查/重跑通过；原 r1 的完整 20-case A/B 中 Text-only 完整交付 18/20，Text+Graph 17/20，两组按原 gold 均命中 11/12。50 次 Graph 调用未产生严格归因的 graph_assisted finding。用户改为委托 Agent 复核后，发现 clean 反例、接口范围和 severity 问题，已另冻 r2，保留旧版字节和成绩。Agent 状态不冒充独立人工审核，修订时 r2 尚无真实模型成绩；现已完成上面的八例挑战，记录见 VALIDATION。未打版本标签。

| 模块 | 状态 | 未完成边界 |
|---|---|---|
| 快照 | 提交、暂存区、已保存工作区；仓库外内容存储；版本身份；冻结竞争检查 | VS Code 的用户选择及产品验收 |
| 文本取证 | 源码行号/hash、差异分页、字面搜索；明确截断/不支持文件 | 非文本内容的语义审查 |
| 业务引擎 | final_only；候选结构/证据/覆盖核验；取消、工具和时间预算 | 缺陷语义正确性须人工判断 |
| Pi | 单会话内置供应商及国内 BigModel GLM-5.3-Flash；该模型真实 CLI smoke 已通过；明确 API Key；精确工具白名单；不加载仓库指令/扩展 | 其他供应商未实测；OAuth 不支持 |
| 原生日志 | 独占空文件经公开 SessionManager.open 初始化；首条回复前持久化；fsync 和写入故障检查 | 不宣称数据库级事务或 exactly-once |
| 报告和恢复 | JSON/Markdown 原子替换；交付清单最后写入；历史校验；原快照新 run | 中断模型会话不续接；运行中硬退出可能留锁 |
| CLI | review/rerun/models/history/show/evidence/doctor/unlock | VS Code UI 尚未实现 |
| Python 图 | 固定 grammar、模块/作用域/import facts、保守 resolver、可恢复 checkpoint、不可变 generation 原子发布、失败缓存、单 review 可终止 worker | 只索引 head；动态 receiver、全类型推断及跨 snapshot 增量更新不支持 |
| VS Code/WSL | 路线和契约确定 | 扩展、VSIX 及正式环境验收待后续 |
| 评测 | 当前 r2 的 20 例 Git SHA/源码/hash；12 defect + 8 clean；r1 按原字节归档；r2 的 8-case T0/G0/G1 挑战已实跑；逐例语义 mapping 与 native trace 派生归因 | r2 未执行全 20-case 新对照；样本仍受控、非独立 holdout，追加重复与公开项目效果待验收 |

资源上限：单文件 1 MiB，捕获最多 10,000 个路径、100 MiB 内容，最多 200 个变更路径；源码最多每次 200 行/32 KiB，差异按页读取，搜索最多 100 个结果。超限会拒绝、明确不可审查或返回截断；不能据此认定无缺陷。工作区符号链接路径拒绝读取；提交/index 的符号链接、子模块、二进制、超大文件不能计入文本审查覆盖。

持久化故障会使本次 run 无法确认交付。历史只把清单及产物 hash 一致的记录当作已交付；`running` 仅是最后写入状态，不代表进程仍活跃。`doctor` 检查锁拥有者，`unlock` 仅清理已退出进程的锁。临时文件可能在硬退出后遗留；不自动删除历史快照和报告。

Graph contract 不含 Tree-sitter CST 类型。稳定性层暂时保持 CONTAINS/IMPORTS/REFERENCES/CALLS；provenance 保存源码范围、site id、snapshot 和 resolver 版本。候选调用只保留 candidate target 与 REFERENCES，不生成已确认 CALLS。发布需要事务完成、外键、计数与 SQLite quick-check；热查询固定在同一已验证 generation，不再 `SELECT *` 全库序列化摘要。解析、文件或容量有缺口的 generation 只能是 partial，并在查询状态与覆盖摘要中继续显式暴露。

默认构图预算为 200,000 facts、400,000 relations，单文件另有事实数和时间上限；预算属于缓存身份。完整文件提取结果逐文件真实提交到 staging，只有校验后的不可变 generation 可查询；容量不足可以发布范围明确的 partial。工作线程的 512 MiB 参数只限制 V8 old generation，不代表进程 RSS、WASM 或 ArrayBuffer 的总内存硬上限。每页最多 100 项/32 KiB，warnings 有界。一个 review 复用同一 worker、只读 SQLite 句柄及检索索引；损坏 generation 单次隔离后从 checkpoint 恢复。

审查 deadline、显式取消和工具预算会关闭新工具接纳，预算在接纳时原子扣减；manifest 分别记录请求、接纳、执行和拒绝数量。runtime abort、工具队列与 worker 清理均有界，取消后不再启动新工具；本地中断不证明供应商已经停止远端计费。

Trace 分析仅作事后评测，不参与 Pi 决策，不改变 FindingCandidate。graph_assisted 要求 resolved incoming caller 在文本中尚未暴露，Graph 返回后另行读取源码，且 accepted evidence 包含该位置。图返回的精确 GLM tokens 不可得；字符/4 粗估单列。中断响应的全零 SDK usage 明确标为不完整，不能视作零费用。人工审核 receipt 绑定所选 corpus/SHA；r2 的 Agent 修订清单明确 humanReviewed=false，不自动升级人工状态。

分支基线：v0.2 从 5422ba7（完整 feat/review-engine）开始。读取远端时 main=916ebf2，只合入快照；完整引擎已合入 feat/immutable-snapshots=9258306。main 与引擎当时分叉 1/3 提交；没有强推、改写 main 或覆盖用户的未提交文档。

RealGolden 使用独立的 public/hidden/audit/lock contract，入口为 `eval:real:admission` 与 `eval:real-live`。RealCorpusAdapter 仅获取精确 Git 对象并交给现有 SnapshotStore/ReviewEngine/Pi；三种 arm 只存在于评测配置。模型循环不读取 hidden/audit。源码、父链与人工/Agent 身份独立保存；当前冻结标注为 Agent source_reviewed，不冒充 human_reviewed。正式运行要求 reserve pilot 通过并产生 READY experiment lock，语料冻结本身不代表模型质量或运行准入。操作见 [评测协议](../eval/README.md)。
