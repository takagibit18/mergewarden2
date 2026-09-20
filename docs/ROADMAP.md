# 分版本实施与验收

2026-09-20：v0.2 聚焦 Python CodeGraph + Retrieval Evaluation。真实调用使用用户明确选择的 provider/model/环境变量，实际验收记录见 VALIDATION。

| 版本 | 模块 | 验收门槛与当前状态 |
|---|---|---|
| v0.1.0 | 不可变提交快照、源码/差异/搜索、Pi 多供应商、final_only、预算/取消、报告、CLI | 离线实现已完成；真实固定变更的模型审查尚未执行；未打标签 |
| v0.2.0 | Python 语法事实、作用域/import resolver、Node SQLite、图工具、可取消构图；20 例 Golden schema/harness | 本地工程路径已实现；全量构建和同快照缓存；真实质量、远端 CI 及人工复核仍须按实测验收，不以脚本结果替代 |
| v0.3.0 | VS Code 本机、引擎工作进程与版本化 IPC、配置/进度/取消/历史/证据/stale、VSIX | 后续实施；底层 staged/worktree 快照已提前作为引擎契约验证 |
| v0.4.0 | WSL、诊断、资源限制、固定集和真实变更评测、受邀试用文档 | 后续实施；Windows+WSL 和真实模型验证均通过才可验收 |

每版按模块拆 PR，先确定性测试，再连接外部组件；完成相应验收才打版本标签。当前分为快照模块、引擎/Pi/CLI 模块，后者依赖前者。

## 已对齐的产品边界

VS Code 为主入口，同时保留独立引擎和 CLI。Python 优先；图以 Tree-sitter→事实→显式 resolver→SQLite 构建。动态接收者、遮蔽或其他不能确定的绑定保留不确定状态。

MVP 固定一个 Pi 会话、final_only 输出。中断后保留实际状态和可验证产物；新 run 复用旧快照，不继续旧模型会话。API Key 使用用户明确的环境变量；扩展阶段使用 SecretStorage。环境跟随工作区运行，WSL 的 Git、Node、源码和模型调用均在 WSL 一侧。

## 真实效果验收

先冻结 20 个标注样例（12 缺陷、8 无缺陷）和至少 3 对公开 Python 项目的缺陷/修复提交，再进行评测。固定供应商、模型、预算，对比源码文本工具与文本+图工具；不新增产品模式。记录发现、漏报、误报和证据，不以小样本宣称普遍效果。

`eval/cases.json` 已冻结 20 个受控 Python 案例、base/head SHA 和预期行为；`eval/corpus.lock.json` 固定内容摘要。按相同 snapshot、模型、预算、finding/report 协议运行；只增加 Graph capability 描述与图工具。真实 Pi 自动追加 cwd，因此内部 A/B 固定相同仓库外 cwd，并保存/比较实际 system prompt 与模型配置。`--repeats` 支持多次运行、轮换两组顺序；本轮不做统计显著性宣称。

当前 20 例需要独立人工复核并增加真实项目案例；`fixtures/live-v01` 仍只是初次模型 smoke。Finding ↔ golden mapping 必须有语义理由，不能以位置重合自动判对。供应商区分“接入支持”和“实测”；脚本 provider 不属于模型效果验证。尚未取得真实调用条件或完成 WSL 验证时，不标记 v0.4.0 完成。

## MVP 之后

增量图更新、其他语言、SSH/容器、原会话续审、增量结果、Jev shadow、PR 发布和 MCP/ACP 独立立项。仓库继续私有；不选择公共许可证、不发布 Marketplace、不实现自动修复或自动合并。
