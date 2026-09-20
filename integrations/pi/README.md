# Pi 适配与验收边界

已安装并锁定 `@earendil-works/pi-coding-agent@0.84.1`，严格类型检查及原生 SDK smoke 已纳入统一验证。这仍是适配起点，尚未接通 ReviewEngine。

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
```

从根目录执行 `npm run setup` / `npm run verify` 可统一安装及验证。测试不使用真实模型、凭据或网络；持久化用的 assistant 消息是清楚标记的 synthetic fixture。

## 已测试

- 原生 CustomEntry 写入、JSONL 重开及 Controller 状态恢复；业务事件不进入模型上下文。
- 当前分支重放，不混入已放弃分支；拒绝快照配置漂移和事件序号缺口。
- journal append/read 不暴露可变的调用方对象。
- 工具 allowlist Hook；真实 SDK 空工具会话；不加载目标仓库 AGENTS.md 和 `.pi/extensions`；未知模型不静默回退。

## 已确认的持久化限制

Pi 0.84.1 新会话在第一条 assistant 消息之前，CustomEntry 可能仅留在内存，JSONL 文件尚未创建。测试明确断言这一行为。首条 assistant 到达后，先前内容才随原生会话写入。

append 返回不是 fsync 确认。SDK 会先更新内存结构再尝试持久化，因此写入故障后的内存/磁盘一致性也不能由领域 Controller 单独保证。生产接入前须确定原生会话的启动持久化策略和失败恢复协议；不得以伪造 assistant 消息掩盖这项限制。

## 尚未完成

不可变源码快照、源码工具、Controller 绑定、扩展初始化与错误传播、取消、报告落盘及故障注入。当前状态目录检查是词法检查，未完成 realpath/symlink 准入，不能接收真实不可信仓库作为生产服务。

Hook 不是沙箱。执行工具仍须再次检查权限、版本与路径。`agent_end` 不能直接完成业务审查。
