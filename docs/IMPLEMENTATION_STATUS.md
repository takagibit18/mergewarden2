# 实现状态 · 2026-09-20

本次完成 M0 开发仓库搭建，不等同于 M1 产品交付。原始架构 DOCX / Markdown 保留为设计历史快照。

| 模块 | 当前状态 | 尚未具备的能力 |
|---|---|---|
| 仓库工程化 | 三个真实 npm lockfile、一键安装、统一验证、四组跨平台 CI 配置 | 发布包、公共许可证 |
| ReviewController / reducer | 39 项核心测试；严格类型检查 | 真实语义验真、产物事务交付 |
| final_only / incremental_candidates | 两种协议可测试 | 实际模型对照收益 |
| SourceReader / SnapshotProvider | 仅接口 | staged/worktree/commit 不可变快照 |
| Evidence hash check | 完整性检查已测试 | 结论语义正确性 |
| DecisionAdvisor / Noop / Rule | off/shadow/advisory 单测 | Jev 效果、无额外时延保证 |
| MemoryJournal | 仅测试和 synthetic demo | 生产持久化 |
| PiSessionJournal | Pi 0.84.1 实装；原生 JSONL 重开、当前分支、恢复身份与事件顺序测试 | 首次回复前可靠持久化、fsync、崩溃恢复 |
| Pi session / Hook | 真实 SDK 创建、空工具、目标仓库指令/扩展隔离 smoke | 完整业务绑定、源码工具、模型审查 |
| Tree-sitter Python | 真 grammar 测试；锁定 npm 包、commit、ABI 与 SHA-256；语法错误和 Unicode 测试 | 完整语言语义和调用目标解析 |
| 导入/作用域 resolver | 未实现 | 可靠的跨文件调用绑定 |
| SQLite 图存储 | schema 草案 | store/query/incremental adapter |
| Jev / IDE / PR / MCP / ACP | 文档与契约边界 | 生产实现 |

## M1 仍需满足

真实 review 命令仍未实现。下一步先实现不可变源码快照和只读工具，再接 Pi 业务 Controller、模型输出、取消与报告落盘。
Pi 新会话在首条 assistant 消息前可能不落盘，不能将当前适配器当作可靠业务日志。也不能通过注入假 assistant 消息来伪造生产审查进度。
业务 completed 目前仅表示领域状态闭合；产品必须在报告可靠写入后确认完整交付。
