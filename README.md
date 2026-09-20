# MergeWarden 2

基于 Pi 的只读代码审查引擎。当前已实现 **v0.1 审查闭环与 CLI，停在真实模型验收前**。原有 51 项测试保留；离线验证覆盖真实 Pi SDK 的工具循环、不可变源码证据和失败交付路径。尚未宣称模型审查效果，也未打 v0.1.0 标签。

## 开始使用

要求 Node.js **22.19+**、Git 和 npm。

```sh
npm run setup
npm run verify
npm run cli -- help
npm run cli -- models
```

安装使用三个锁定依赖文件且禁用安装脚本。测试不需要 API Key，不访问真实模型。`models` 读取固定 Pi 版本内置目录及应用注册的智谱 Flash 配置；目录存在表示接入能力，不表示该供应商已实测。

配置和首次验收见 **[真实模型验收指南](docs/LIVE_ACCEPTANCE.md)**；已选 GLM-5.3-Flash 可直接按 **[智谱配置](docs/BIGMODEL.md)** 操作。引擎只从命令行明确指定的环境变量读取密钥，不自动采用仓库配置、`.pi`、OAuth 或现有 Pi 登录。

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
| `integrations/tree-sitter` | 已有 Python 真 grammar 测试；语义 resolver、SQLite 图查询留到 v0.2 |

CLI 的 `--scope staged` / `--scope worktree` 已有底层回归测试；VS Code 的选择界面、证据跳转、stale 提示及 Windows/WSL 产品验收留到后续版本。忽略文件和未保存缓冲区不纳入。文本工具不会执行仓库代码。

默认预算 **10 分钟、100 次工具调用**，可用 `--timeout-ms` / `--max-tools` 调整。记录 token 用量，不估算未知价格。候选通过结构和证据 hash 校验后作为人工复核建议保存，这不证明缺陷语义成立。

## 验证与后续

- `npm run verify`：核心、CLI、快照、引擎、两个适配器、类型检查及明确标注的 synthetic demo。
- [实现状态](docs/IMPLEMENTATION_STATUS.md) · [验证记录](docs/VALIDATION.md) · [分版本路线](docs/ROADMAP.md) · [决策](docs/DECISIONS.md)。
- [开发约束](AGENTS.md) · [安全边界](SECURITY.md)。仓库保持私有，公共许可证尚未选择。
- [原架构正文](docs/ARCHITECTURE.md) 和 [DOCX](docs/MergeWarden2_Top_Level_Design.docx) 是输入骨架的历史材料；当前实现以状态表为准。

VSIX、完整 CodeGraph、WSL 产品验收、20 个标注样例和 3 对公开项目提交评测尚未交付。没有 Marketplace 发布、自动修复、自动合并、PR 评论或 Jev 调用。
