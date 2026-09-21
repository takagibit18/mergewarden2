# MergeWarden 2

基于 Pi 的只读代码审查引擎。当前在 v0.1 审查闭环上实现 **v0.2 Python CodeGraph 与可复现评测**：同一个 Agent 按需使用文本和图工具，最终 finding 仍引用不可变源码。BigModel GLM-5.3-Flash 已通过真实 CLI 审查、图工具、报告重开、证据核验和同快照重跑 smoke；实测范围见 [验证记录](docs/VALIDATION.md)。**尚无证据证明 Graph 提高了审查质量**，未打版本标签。

## 开始使用

要求 Node.js **22.19+**、Git 和 npm。

```sh
npm run setup
npm run verify
npm run cli -- help
npm run cli -- models
```

安装使用三个锁定依赖文件且禁用安装脚本。测试不需要 API Key，不访问真实模型。`models` 读取固定 Pi 版本内置目录及应用注册的智谱 Flash 配置；目录存在表示接入能力，不表示该供应商已实测。

配置和首次验收见 **[真实模型验收指南](docs/LIVE_ACCEPTANCE.md)**。引擎只从命令行明确指定的环境变量读取密钥，不自动采用仓库配置、`.pi`、OAuth 或现有 Pi 登录。

```sh
npm run cli -- review --repo /path/to/repository --base BASE_SHA --head HEAD_SHA --provider PROVIDER --model MODEL_ID --api-key-env MERGEWARDEN_API_KEY
```

Windows 默认数据目录是 `%LOCALAPPDATA%/MergeWarden2`，其他环境为 `~/MergeWarden2`；可用 `--state PATH` 指定。数据必须位于被审仓库之外。JSON 结果写到标准输出，过程信息写到标准错误。结果为 `completed` 且报告和交付记录保存成功才算完整交付；缺失最终提交、预算耗尽、错误或取消会明确区分。无改动返回 `no_changes`，不创建模型会话。

## 当前模块

| 模块 | 能力 |
|---|---|
| `src/snapshot` | 提交比较、HEAD→index、HEAD→已保存磁盘内容；显式选择未跟踪文件；冻结及复用、源码、差异分页、文本搜索 |
| `src/engine` | 单次审查、最终候选校验、证据完整性、覆盖检查、预算、取消、原快照重跑 |
| `integrations/pi` | 原生会话与业务 CustomEntry、启动前落盘、同步检查、模型工具循环、精确工具白名单 |
| `src/cli` | 审查、模型目录、报告历史、证据读取、环境诊断、死进程遗留锁清理 |
| `integrations/tree-sitter` | 固定 Python grammar → 普通语法事实；模块、类、函数、方法、import、引用和调用位置 |
| `src/graph` | 显式作用域/import resolver；HEAD 快照 SQLite；首次查询构图、缓存校验/重建、工作线程取消、分页与覆盖说明 |
| `eval` / `src/eval` | 20 个冻结受控案例；同快照消融、质量/成本指标、原生 tool trace 归因、独立人工审核页与 provenance 校验 |

CLI 的 `--scope staged` / `--scope worktree` 已有底层回归测试；VS Code 的选择界面、证据跳转、stale 提示及 Windows/WSL 产品验收留到后续版本。忽略文件和未保存缓冲区不纳入。文本工具不会执行仓库代码。

默认预算 **10 分钟、100 次工具调用**，可用 `--timeout-ms` / `--max-tools` 调整。记录 token 用量，不估算未知价格。候选通过结构和证据 hash 校验后作为人工复核建议保存，这不证明缺陷语义成立。

图工具只有 `graph_lookup`（精确 symbol/限定名）和 `graph_neighbors`（指定关系、方向和分页的一跳查询）。图只索引当前快照的 **head**，不会把 base/head 混在一起。返回 resolution、coverage 和 warnings；空结果不能证明没有调用者。图查询后的 finding 证据仍须用 `read_source` 实际读取和核对。动态 receiver、外部依赖、复杂动态绑定保持不确定；[解析边界](integrations/tree-sitter/README.md)。

图不存在时延迟构建；未调用图工具的审查不会加载 parser 或创建图数据库。索引位于仓库外，绑定 snapshot、schema v2、resolver 和固定 parser 版本；损坏/未完成索引从冻结源码全量重建。图错误使本次结果保持 partial，不能变成 completed clean。

评测命令见 [评测说明](eval/README.md)。`npm run eval -- --offline --all --output /outside/checkout/eval-run` 运行真实 Pi SDK 加脚本 provider，仅验证工程路径。`--live` 使用固定配置与明确环境变量；逐例语义匹配完成后才能汇总真实质量。Text-only 是内部消融，CLI 产品没有模式切换。

`eval:traces` 从实际工具轨迹派生 finding 的 `discoveryPath`，保留 Graph → 新 caller → 源码读取 → accepted evidence 链，不采信模型自述，也不更改 finding 证据协议。`eval:human-review` 生成不含模型结果的逐例审核页；只有实际人工作答并通过 corpus/SHA 校验，才能生成审核后的 `annotationProvenance`。原始 case 与答案不会被这两个工具改写。

原版 r1 的完整 20-case GLM A/B 已实跑一次：两组按当时标签各命中 11/12 个缺陷，完整交付 Text 18/20、Graph 17/20。50 次 Graph 调用未形成严格的 graph_assisted finding。随后 Agent 源码复核发现一个 clean 反例、接口范围和 severity 问题，已授权修订为独立冻结的 r2；旧语料及分数保留，不作为 r2 成绩。5 次超时请求存在 usage 缺口，tokens 不等于完整计费记录。[版本与修订边界](eval/README.md) · [历史验证与 trace 指标](docs/VALIDATION.md)。

## 验证与后续

- `npm run verify`：核心、CLI、快照、引擎、两个适配器、类型检查及明确标注的 synthetic demo。
- [实现状态](docs/IMPLEMENTATION_STATUS.md) · [验证记录](docs/VALIDATION.md) · [分版本路线](docs/ROADMAP.md) · [决策](docs/DECISIONS.md)。
- [开发约束](AGENTS.md) · [安全边界](SECURITY.md)。仓库保持私有，公共许可证尚未选择。
- [原架构正文](docs/ARCHITECTURE.md) 和 [DOCX](docs/MergeWarden2_Top_Level_Design.docx) 是输入骨架的历史材料；当前实现以状态表为准。

VSIX、WSL 产品验收、独立人工复核的真实项目黄金集及 3 对公开项目提交评测尚未交付。当前 r2 在其模型调用前冻结，但作者已见过 r1 结果，不能称作独立 holdout 或人工标注。没有 Marketplace 发布、自动修复、自动合并、PR 评论或 Jev 调用。


## LocAgent retrieval 内部实验

内部 G1 通过 search_entity（exact／BM25／fuzzy）与受控 traverse_graph 调用同一冻结 Graph，read_source 继续负责 finding evidence。产品仍默认原有图工具；没有新增产品模式。运行方式与适配限制见 [实验协议](docs/experiments/LOCAGENT_REPLICATION.md)。

r2 的 8-case × T0/G0/G1 实测已完成：F1 为 1.00／1.00／0.889，完整交付 7/8／4/8／5/8，Graph-assisted 与 novel→source 均为 0。未达到扩大实验门槛，未执行 full 20×3。该受控小样本不能证明真实大仓库的 Graph 价值；详见 [验证记录](docs/VALIDATION.md)。
