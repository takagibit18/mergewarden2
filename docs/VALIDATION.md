# 实测记录 · 2026-09-20

## v0.2 本地验收

修改前在完整 ReviewEngine 提交 5422ba7 跑过全部验证：**90 passed，0 failed，0 skipped**。随后开发分支安全快进到同树的 v0.1 合并提交 9258306；未改写 main。初始 6 处用户文档改动已另存仓库外补丁并保留。

最终 Windows / Node 24.12.0 的 `npm run verify` 退出码 **0**：核心/CLI/快照/引擎/评测 **77**、真实 Pi SDK **16**、真实 Python grammar/resolver/store/Golden **37**，共 **130 passed，0 failed，0 skipped**；三组类型检查、demo 和 status 均通过。原 90 项用例继续保留；声明限定名增加模块前缀，原 grammar 断言随 contract 更新。

新增验证包括同名隔离、嵌套/类作用域、遮蔽、六种 import、解析缺口、动态 receiver/metaclass；snapshot 隔离、确定性重建、损坏/未完成/版本过期/覆盖篡改缓存、分页、工作线程取消；Graph 错误阻止 completed clean、真实 Pi 工具循环、Graph 后伪造 source hash 仍须实际 read_source；Text-only 不建图；20 例 Git SHA 重建与快照读取、指标及一对一语义匹配。

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

### 未完成的验收

用户已选择 bigmodel/glm-5.3-flash 与 MERGEWARDEN_API_KEY，但当前运行环境尚未读取到该变量；**真实模型 A/B 未执行，Graph 增量质量未证明**。真实运行入口及匹配步骤见 [eval](../eval/README.md)。没有打 v0.2.0 标签；真实质量验收与独立人工标注复核仍待完成。

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

新增国内 BigModel GLM-5.3-Flash 配置；3 项离线测试验证注册、实际 Pi HTTP 请求编解码/工具回合和模拟 401，无真实智谱调用。用户配置命令见 [智谱配置](BIGMODEL.md)。

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

v0.2 已实现 Python resolver/SQLite 与 20 个受控案例，详见上方实测。VS Code/VSIX、Windows/WSL 产品验收、独立人工黄金集及 3 对公开项目评测尚未完成。没有真实供应商被标为“已实测”，也未发布 Marketplace、公共许可证或版本标签。
