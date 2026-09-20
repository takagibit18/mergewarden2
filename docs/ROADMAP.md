# 实施顺序与验收

## M0 · 仓库基线（工程化已完成）
依赖版本已核对，三个真实 lockfile、一键安装、统一验证及跨平台 CI 已配置。许可证与第一主入口继续保持开放决策。
先在目标 Windows + Node 22.19+ 环境跑通核心与类型检查。

## M1 · 单一只读审查闭环
实现 SnapshotProvider（先 commit range，再 staged/saved workspace）；统一 base/head/source/diff。
实现 read_source、read_diff、search_text；全部返回明确范围、snapshot、截断和错误状态。
接 Pi 的真实会话、Hook、结果提交、超时/取消与报告持久化；不用 MemoryJournal 上线。
验证一份人工确定的真实小变更；未完整交付必须为 partial/failed。

## M2 · 真实 CodeGraph
固定 grammar commit/ABI/hash；先 Python，语言范围仍可调整。
完善作用域、import/alias、引用绑定；同名/动态调用/删除/重命名测试齐全。
实现 SQLite store + lookup/neighbors，再实现增量失效；增量结果须与全量重建一致。
所有不确定关系带 resolution/provenance；只读查询不默认注入图上下文。

## M3 · 证据型 IDE 入口（待产品确认）
独立工作进程、版本化 IPC、进度、取消、报告、证据跳转和 stale 标记。
先做原生评论/诊断，不先做大而全聊天窗口或仓库全图。
覆盖 Windows、WSL/SSH/Container 的工作区放置；不读取未保存缓冲区。

## M4 · 评测后引入可选建议
先记录 off/规则基线，然后 Jev shadow；验证 input/candidate 完整性、弃权和回退。
观察与主 Agent 一致率只做描述；端到端对照评估质量、完整交付、总成本和时延。
最后再选择是否加入 advisory。不让 Jev 决定权限、事实关系或发布。

## 暂缓
大规模服务化、多租户 SaaS、图可视化大屏、自动修复/合并、在线自进化、
多 Agent 调度、通用路由平台。已有黄金集/证据规则可迁移，旧 harness/双模式分支不迁移。
