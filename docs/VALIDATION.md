# 实测记录 · 2026-09-20

环境：Windows，Node.js 24.12.0，npm 11.6.2。以下为本次目标开发机执行结果，不是原骨架容器记录。

## 本地已完成

| 检查 | 结果 |
|---|---|
| 官方 npm registry 安装 | 根目录、Pi、Tree-sitter 三个真实 lockfile 已生成；安装时 audit 均为 0 vulnerabilities |
| `npm run setup` | 三个目录按 lockfile 全新执行 `npm ci --ignore-scripts` 成功 |
| `npm run verify` | 安装后完整执行成功，退出码 0 |
| 核心测试 | 39 passed / 0 failed / 0 skipped |
| Pi SDK smoke | 7 passed / 0 failed / 0 skipped |
| 真 Python grammar | 5 passed / 0 failed / 0 skipped |
| 严格类型检查 | 核心 + Pi + Tree-sitter 三个项目通过；TypeScript 5.9.3 / @types/node 24.12.4 |
| demo / status | 成功；demo 明确为 synthetic，status 明确 M0 和未实现功能 |
| `review` 未实现边界 | 返回退出码 2，明确没有执行真实审查 |
| SQLite schema | Python sqlite3 内存建表成功，foreign_keys=ON；不代表图服务 |

合计 **51 项测试通过**。Pi 测试使用真实安装的 SDK 和原生 JSONL；assistant 内容为 synthetic fixture，不访问模型。Parser 测试使用官方发布 WASM，不执行 Python 源码。

## 固定的外部依赖

- Pi coding-agent 0.84.1；npm transitive dependencies 由适配器 lockfile 固定。
- web-tree-sitter 0.27.0；Python grammar 0.25.0，ABI 15。
- grammar commit、SHA-256 和许可证记录见 `integrations/tree-sitter/grammars/python.lock.json`。

## 新发现的边界

Pi 0.84.1 新会话在首条 assistant 消息之前可能没有 JSONL 文件；该行为已纳入回归测试。写入 native CustomEntry 成功不等于可靠落盘，也不能据此承诺 fsync 或 exactly-once。

测试已覆盖会话重开、当前分支、身份不符、事件序号异常和调用方对象隔离；没有完成进程崩溃、截断尾记录、磁盘故障或生产恢复协议验收。

## CI

`.github/workflows/core.yml` 对 Windows/Linux × Node 22.19.0/24.12.0 执行相同 setup 和 verify。每次远端实际结果以 [GitHub Actions](https://github.com/takagibit18/mergewarden2/actions) 对应提交为准；不会把本地 Windows 的通过冒充 Linux 实测。

## 未执行 / 未实现

没有真实模型审查、完整快照和源码工具、完整 resolver/图存储、Jev、IDE、MCP/ACP 或 PR 发布。没有选择公共许可证，没有部署服务。原架构 DOCX 与同源正文保留骨架历史内容，未重新生成或重新验证排版。

原骨架在生成环境中因 npm DNS 失败而未安装依赖；此限制在本次目标机器的官方 registry 安装中已解除。
