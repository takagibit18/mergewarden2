# 首次真实模型验收

当前状态：**等待用户配置，尚未发起真实模型请求**。离线模型替身只验证控制流，不能说明缺陷检出能力。先完成本页，再决定 v0.1.0 是否验收及打标签。

## 1. 选择并配置

在仓库根目录运行：

```powershell
npm run cli -- models
# 可按供应商缩小列表，例如：
npm run cli -- models --provider anthropic
```

列表来自固定 Pi 0.84.1 的内置目录，可能与供应商实时可用性不同。选择一个支持 API Key 的供应商及其准确模型 ID；不会自动换模型。需要云账号、区域或 OAuth 等额外配置的供应商不在本轮 CLI 配置范围内。

在**本机 PowerShell**设置环境变量，勿将密钥粘贴到聊天、仓库文件或命令参数：

```powershell
$secureKey = Read-Host 'API Key' -AsSecureString
$env:MERGEWARDEN_API_KEY = [System.Net.NetworkCredential]::new('', $secureKey).Password
Remove-Variable secureKey
$reviewProvider = '填入供应商名'
$reviewModel = '填入准确模型 ID'
```

此设置仅对当前 PowerShell 及其启动的进程有效。在这个窗口运行审查命令；Codex 已在运行的进程不会自动获得新设置的环境变量。这里只需向协作者提供供应商、模型和变量名，不能提供密钥。

## 2. 固定用例

用例答案已冻结在 `fixtures/live-v01/fixture.json`。它包含原版、移除空输入保护的缺陷版、恢复保护的修复版；标注文件不放入被审查的小仓库。

从零准备（输出目录必须不存在）：

```powershell
node scripts/prepare-live-fixture.mjs ../mergewarden2-live-fixture
```

本次工作已在 `../mergewarden2-live-fixture` 准备好仓库，提交如下；不用再次生成：

| 版本 | 提交 |
|---|---|
| base | `51d95c6171faebcf63335d4e8746d796c5817343` |
| bug | `064f999bba8cfc05063ca5bdd1efaf4c312eaa22` |
| fixed | `eeafcb46c5f391eb59892c69c007da844da16c6b` |

在其他机器重新生成时，以脚本输出的提交为准。

## 3. 发起审查（这一步会调用并可能产生供应商费用）

```powershell
npm run cli -- review --repo ../mergewarden2-live-fixture --base 51d95c6171faebcf63335d4e8746d796c5817343 --head 064f999bba8cfc05063ca5bdd1efaf4c312eaa22 --provider $reviewProvider --model $reviewModel --api-key-env MERGEWARDEN_API_KEY

npm run cli -- review --repo ../mergewarden2-live-fixture --base 064f999bba8cfc05063ca5bdd1efaf4c312eaa22 --head eeafcb46c5f391eb59892c69c007da844da16c6b --provider $reviewProvider --model $reviewModel --api-key-env MERGEWARDEN_API_KEY
```

默认 10 分钟、100 次工具调用。输出含 run ID、JSON 和 Markdown 报告路径；失败或不完整返回非零退出码。保存运行清单中的 token 用量，不编造费用。Ctrl+C 取消并尽可能保存取消报告；关闭窗口等硬中断可能留下 `running` 清单，需要诊断。

## 4. 人工核验

- 缺陷版应发现 `summary([])` 经 `mean([])` 触发零除，证据指向冻结的 head `stats.py:2`。
- 修复版不得继续报告同一个已修复问题。其他发现逐条核对，不先假设是误报。
- 两次均须完整交付，证据 hash 可复核，报告重开后仍能读取。
- 将供应商、模型、预算、两个 run ID、预期是否命中、误报/漏报和判断理由记录到验收表。失败如实记录，不修改既有答案来迁就模型。

```powershell
npm run cli -- history
npm run cli -- show --run RUN_ID
npm run cli -- evidence --run RUN_ID --finding FINDING_ID
npm run cli -- doctor --repo ../mergewarden2-live-fixture
```

中断后重跑使用原快照及相同供应商/模型，创建新会话：

```powershell
npm run cli -- rerun --repo ../mergewarden2-live-fixture --run RUN_ID --provider $reviewProvider --model $reviewModel --api-key-env MERGEWARDEN_API_KEY
```

`doctor` 确认锁拥有者已退出后，可用 `unlock --repo ...` 清理遗留锁。不要手工改写已保存 JSONL、报告或快照来恢复“成功”状态。

本页通过仅满足初次模型审查门槛；v0.4 仍要求完整标注集、真实公开 Python 变更、Windows/WSL 和扩展验收。
