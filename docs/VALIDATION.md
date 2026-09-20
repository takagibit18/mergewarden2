# 实测记录 · 2026-09-20

## v0.1 离线实现验证

本机：Windows，Node.js 24.12.0、npm 11.6.2、Git 2.53.0。最新完整 `npm run verify` 退出码 0：

| 检查 | 结果 |
|---|---|
| 核心、快照、引擎和 CLI | 71 passed / 0 failed / 0 skipped |
| Pi 原生 SDK | 11 passed / 0 failed / 0 skipped |
| Python 真 grammar | 5 passed / 0 failed / 0 skipped |
| 类型检查 | 核心、Pi、Tree-sitter 全部通过 |
| demo / status | 成功；明确 synthetic 和真实模型未验收 |

共 **87 项通过**，保留原有 51 项，新增 36 项。没有真实模型调用。

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

完整图 resolver/SQLite、VS Code/VSIX、Windows/WSL 产品验收、20 个标注样例及 3 对公开项目评测尚未实施。没有真实供应商被标为“已实测”，也未发布 Marketplace、公共许可证或版本标签。
