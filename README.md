# MergeWarden 2

基于 Pi runtime 的证据优先代码审查引擎。当前交付为 **M0 可验证开发基线**：领域核心、原生会话适配、真实 Python 语法提取、锁定依赖和跨平台 CI。

**真实仓库审查尚未实现。** `demo` 是 synthetic 控制流示例；`review` 明确退出并报未实现。不可变快照、源码工具、模型审查闭环、完整 CodeGraph、IDE 和发布能力按路线图继续建设。

## 快速开始

要求 Node.js **22.19+** 和 npm。CI 覆盖 Node 22.19.0 / 24.12.0、Windows / Linux。

```bash
git clone https://github.com/takagibit18/mergewarden2.git
cd mergewarden2
npm run setup
npm run verify
```

`setup` 分别对根目录、Pi 和 Tree-sitter 执行 `npm ci --ignore-scripts`，使用三个真实 lockfile。安装过程不执行第三方包脚本；测试不需要模型密钥，不发送模型请求。

| 命令 | 用途 |
|---|---|
| `npm test` | 39 项零依赖核心测试；无需先安装适配器 |
| `npm run check` | 核心测试及严格类型检查 |
| `npm run test:integrations` | Pi 原生 JSONL、隔离边界与真实 Python grammar 测试 |
| `npm run typecheck:integrations` | 两个适配器类型检查 |
| `npm run verify` | 核心、集成、类型检查、demo 和 status |
| `npm run demo` | 明确标记 synthetic 的控制流示例 |
| `npm run status` | 实现边界概览 |

仅开发领域核心时可执行 `npm ci --ignore-scripts`，无需安装 Pi 或解析器。

## 当前能力与边界

- 领域事件、候选提交协议、证据 hash、恢复身份约束与 DecisionAdvisor off/shadow/advisory 调度已测试。
- Pi 0.84.1 原生 CustomEntry 写入、会话重开和当前分支重放已做本地 smoke；会话起点关闭默认工具及目标仓库资源加载。
- **Pi 在首次 assistant 消息前可能不创建 JSONL。append 不等于 fsync。** 强持久化、崩溃恢复和完整业务接线仍是 M1 门槛，见 [Pi 说明](integrations/pi/README.md)。
- Python 使用 web-tree-sitter 0.27.0 + 官方 tree-sitter-python 0.25.0 WASM；运行前检查 SHA-256 和 ABI。调用目标保持 `unresolved`，尚无 import resolver 或图查询服务。
- Jev、IDE、GitHub 评论、MCP 和 ACP 仍为接口或文档边界。许可证未选定，仓库暂按私有开发仓库管理。

## 布局

```text
src/domain, application       与外部 SDK 解耦的领域规则
src/ports, protocol           会话、源码、快照与引擎契约
src/advisor, graph            可选建议与图查询契约
integrations/pi               Pi SDK、Hook、CustomEntry 与 smoke 测试
integrations/tree-sitter      固定 grammar、语法提取与真实解析测试
integrations/{vscode,github,mcp,acp,jev}  后续适配边界
schemas                       SQLite schema 草案
scripts                       锁定依赖安装、设计文档生成
.github/workflows             Windows/Linux × Node 22/24 验证
```

## 文档

- [实现状态](docs/IMPLEMENTATION_STATUS.md)、[实测记录](docs/VALIDATION.md)、[实施顺序](docs/ROADMAP.md)
- [决策索引](docs/DECISIONS.md)、[开发约束](AGENTS.md)、[贡献指南](CONTRIBUTING.md)、[安全边界](SECURITY.md)
- [原始架构正文](docs/ARCHITECTURE.md)、[原始顶层设计 DOCX](docs/MergeWarden2_Top_Level_Design.docx)：保留输入骨架的历史设计快照，其中的“未安装/未验证”描述属于原交付时点；当前状态以上述状态表与验收记录为准。

只有一个 agentic 审查工作流；图与文本是互补工具。候选提交、语义验真、对外发布保持独立。不将 schema 通过、空结果或 agent_end 当作审查完成。
