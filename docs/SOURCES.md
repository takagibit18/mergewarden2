# 参考来源与核对边界

整理：2026-09-20。外部设计只提供参照，不构成本项目性能或生产能力证明。

## [S1] Pi SDK / ResourceLoader / Extension 接口

https://pi.dev/docs/latest/sdk

本次网页核对。SDK 底座、资源加载、原生 session 接入的设计依据。

## [S2] Pi session format / CustomEntry

https://pi.dev/docs/latest/session-format

本次网页核对。原生 JSONL、分支以及不进入 LLM 上下文的 custom entries。

## [S3] Pi coding-agent package manifest

https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/package.json

本次读到 0.84.1 / @earendil-works / Node >=22.19.0；不是 npm 安装结果。

## [S4] Tree-sitter static node types / binding manifest

https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types

本次网页核对；binding 源码版本 0.27.0，registry 与 grammar ABI 尚未验证。

## [S5] RepoGraph v1

https://arxiv.org/html/2410.14684v1

本次读取 HTML。借鉴仓库图与工具查询；不将修复实验当作本项目 review 效果。

## [S6] Alibaba Open Code Review

https://github.com/alibaba/open-code-review

前两轮源码讨论参照；核对版本 a003b9341a65130b024829101ea35494b56569e1。重点 code_comment 与 session/resume，不是恢复能力实测。

## [S7] Codex 原生 review 实现

https://github.com/openai/codex/blob/595cc91e8cbb1c2ca822d0311dcf12709410c582/codex-rs/core/src/tasks/review.rs

前两轮源码讨论参照。结论仅限该原生 review 路径，不推断所有 Codex 产品。

## [S8] TypeSafe 官方开发 Skill

https://github.com/typesafe-ai/skills/blob/65a39f393687675ce170e6094757de20370365b9/skills/typesafe-ai/SKILL.md

前两轮核对资料。Jev 局部有类型判断的设计参照。本次 TypeSafe 在线文档访问失败，API 留待集成时重查。

## [S9] Alibaba VS Code 扩展架构

https://github.com/alibaba/open-code-review/tree/a003b9341a65130b024829101ea35494b56569e1/extensions/vscode

前两轮源码讨论参照。只借鉴引擎与薄客户端分层，不复制其实现。

## 本次仓库搭建的版本固定

已从官方 npm registry 安装 Pi coding-agent 0.84.1、web-tree-sitter 0.27.0 和 tree-sitter-python 0.25.0，并提交真实 lockfile。Pi 行为以安装包源码和 smoke 为准；grammar 来源、commit、ABI 和 SHA-256 见 integrations/tree-sitter/grammars/python.lock.json。前述正文保留骨架生成时的核对边界，最新执行结果见 VALIDATION.md。
