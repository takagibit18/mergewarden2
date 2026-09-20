# 当前实现状态 · 2026-09-20

v0.2 的 Python 图与评测工程路径已接在 v0.1 上，修订 Golden 前本地 152 项测试和 Windows/Linux × Node 22/24 远端 CI 已通过。真实 GLM CLI 审查/重跑通过；原 r1 的完整 20-case A/B 中 Text-only 完整交付 18/20，Text+Graph 17/20，两组按原 gold 均命中 11/12。50 次 Graph 调用未产生严格归因的 graph_assisted finding。用户改为委托 Agent 复核后，发现 clean 反例、接口范围和 severity 问题，已另冻 r2，保留旧版字节和成绩。Agent 状态不冒充独立人工审核，r2 尚无真实模型成绩；记录见 VALIDATION。未打版本标签。

| 模块 | 状态 | 未完成边界 |
|---|---|---|
| 快照 | 提交、暂存区、已保存工作区；仓库外内容存储；版本身份；冻结竞争检查 | VS Code 的用户选择及产品验收 |
| 文本取证 | 源码行号/hash、差异分页、字面搜索；明确截断/不支持文件 | 非文本内容的语义审查 |
| 业务引擎 | final_only；候选结构/证据/覆盖核验；取消、工具和时间预算 | 缺陷语义正确性须人工判断 |
| Pi | 单会话内置供应商及国内 BigModel GLM-5.3-Flash；该模型真实 CLI smoke 已通过；明确 API Key；精确工具白名单；不加载仓库指令/扩展 | 其他供应商未实测；OAuth 不支持 |
| 原生日志 | 独占空文件经公开 SessionManager.open 初始化；首条回复前持久化；fsync 和写入故障检查 | 不宣称数据库级事务或 exactly-once |
| 报告和恢复 | JSON/Markdown 原子替换；交付清单最后写入；历史校验；原快照新 run | 中断模型会话不续接；运行中硬退出可能留锁 |
| CLI | review/rerun/models/history/show/evidence/doctor/unlock | VS Code UI 尚未实现 |
| Python 图 | 固定 grammar、模块/作用域/import facts、保守 resolver、SQLite v2、按需两工具、可终止工作线程 | 只索引 head；动态 receiver、全类型推断及增量更新不支持 |
| VS Code/WSL | 路线和契约确定 | 扩展、VSIX 及正式环境验收待后续 |
| 评测 | 当前 r2 的 20 例 Git SHA/源码/hash；12 defect + 8 clean；r1 按原字节归档，执行/评分/trace/审核可显式选 corpus；逐例修订 lineage 与 Agent provenance | r1 真实集 5 次超时且含标注争议；r2 无真实模型结果；样本仍受控、非独立 holdout，追加重复与公开项目效果待验收 |

资源上限：单文件 1 MiB，捕获最多 10,000 个路径、100 MiB 内容，最多 200 个变更路径；源码最多每次 200 行/32 KiB，差异按页读取，搜索最多 100 个结果。超限会拒绝、明确不可审查或返回截断；不能据此认定无缺陷。工作区符号链接路径拒绝读取；提交/index 的符号链接、子模块、二进制、超大文件不能计入文本审查覆盖。

持久化故障会使本次 run 无法确认交付。历史只把清单及产物 hash 一致的记录当作已交付；`running` 仅是最后写入状态，不代表进程仍活跃。`doctor` 检查锁拥有者，`unlock` 仅清理已退出进程的锁。临时文件可能在硬退出后遗留；不自动删除历史快照和报告。

Graph contract 不含 Tree-sitter 类型。关系只包含 CONTAINS/IMPORTS/REFERENCES/CALLS；provenance 保存源码范围、site id、snapshot 和 resolver 版本。候选调用只保留 candidate target 与 REFERENCES，不生成已确认 CALLS。数据库就绪需要事务完成、外键/数量核验和内容摘要；缓存读取重新核验版本、SQLite 完整性和内容摘要。解析有缺口的完整索引可 ready，但查询状态为 parse_incomplete，不能把它解释为完整程序关系。

构图限 200,000 facts、400,000 relations，工作线程内存上限 512 MiB，并受本次 review 的超时/取消约束。每页最多 100 项/32 KiB items，warnings 有界。一次查询一个工作线程，因此 warm request 包含线程启动和缓存校验；queryMs 单独记录。SQLite 派生数据损坏会保留 .discarded 文件供诊断，再重建；不做自动清理或复杂增量失效。

Trace 分析仅作事后评测，不参与 Pi 决策，不改变 FindingCandidate。graph_assisted 要求 resolved incoming caller 在文本中尚未暴露，Graph 返回后另行读取源码，且 accepted evidence 包含该位置。图返回的精确 GLM tokens 不可得；字符/4 粗估单列。中断响应的全零 SDK usage 明确标为不完整，不能视作零费用。人工审核 receipt 绑定所选 corpus/SHA；r2 的 Agent 修订清单明确 humanReviewed=false，不自动升级人工状态。

分支基线：v0.2 从 5422ba7（完整 feat/review-engine）开始。读取远端时 main=916ebf2，只合入快照；完整引擎已合入 feat/immutable-snapshots=9258306。main 与引擎当时分叉 1/3 提交；没有强推、改写 main 或覆盖用户的未提交文档。
