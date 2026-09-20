# 智谱 GLM-5.3-Flash

已通过 Pi 的公开 provider 注册接口增加固定接入，无需修改目标仓库配置：

| 项 | 值 |
|---|---|
| MergeWarden provider | `bigmodel` |
| 模型 ID | `glm-5.3-flash` |
| Base URL | `https://open.bigmodel.cn/api/paas/v4/` |
| 请求地址 | `https://open.bigmodel.cn/api/paas/v4/chat/completions` |
| 鉴权 | `Authorization: Bearer <API Key>` |

地址及模型选择由用户确认。该配置使用国内通用 API，不使用海外 Z.AI 或 Coding Plan 地址；不回退到 `glm-5.3`。

## 配置和首次运行

在 PowerShell 中执行；提示输入时粘贴密钥并回车，内容隐藏：

```powershell
cd 'C:\Users\Lenovo\Documents\ChatGPT\简历\mergewarden2'
$secureKey = Read-Host '智谱 API Key' -AsSecureString
$env:MERGEWARDEN_API_KEY = [System.Net.NetworkCredential]::new('', $secureKey).Password
Remove-Variable secureKey
npm run cli -- models --provider bigmodel
```

应列出 `glm-5.3-flash`。此处只查看本地目录，不会调用供应商。

在**同一窗口**执行实际审查：

```powershell
npm run cli -- review --repo ../mergewarden2-live-fixture --base 51d95c6171faebcf63335d4e8746d796c5817343 --head 064f999bba8cfc05063ca5bdd1efaf4c312eaa22 --provider bigmodel --model glm-5.3-flash --api-key-env MERGEWARDEN_API_KEY
```

这一步会向智谱发送审查内容，并可能产生供应商费用。输出包含状态及报告路径。上面的提交属于本机已准备好的缺陷样例；其他机器按 [验收指南](LIVE_ACCEPTANCE.md) 生成样例并替换提交。

随后用同一供应商、模型、预算审查修复版：

```powershell
npm run cli -- review --repo ../mergewarden2-live-fixture --base 064f999bba8cfc05063ca5bdd1efaf4c312eaa22 --head eeafcb46c5f391eb59892c69c007da844da16c6b --provider bigmodel --model glm-5.3-flash --api-key-env MERGEWARDEN_API_KEY
```

密钥仅在当前 PowerShell 环境内；关闭窗口后需重新设置。不要把密钥发送到聊天或写进仓库。

## 验证边界

已离线验证：注册和凭据隔离、准确的请求地址/模型/Bearer、Pi 的真实 OpenAI-compatible HTTP 编解码、流式工具调用、reasoning_content 随工具结果保留、模拟 401 不切换模型。

响应由测试替身提供，未调用真实供应商。智谱账户权限、模型可用性、兼容参数和真实审查效果仍须运行验收确认；不能把离线通过称为供应商已实测。

当前采用 Pi 的 Z.AI 兼容参数处理思考内容；应用侧上下文预算为 65,536 token，单次输出上限为 8,192。这些是保守应用配置，不是官方模型规格。SDK 要求的价格字段为内部占位；产品只报告 token 用量，不输出费用估算或“免费”结论。
