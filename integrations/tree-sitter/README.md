# Tree-sitter Python 适配

真正的 `web-tree-sitter@0.27.0` 读取官方 `tree-sitter-python@0.25.0` 包中的 WASM，再由 CST 提取带作用域名称的定义与调用位置。安装和解析均不执行 Python import，也不加载 npm grammar 的原生绑定。

```bash
npm ci --ignore-scripts
npm run typecheck
npm test
```

默认从锁定的开发依赖读取 grammar，运行前验证 `grammars/python.lock.json` 的 SHA-256 和 ABI。无需另行下载或编译。WASM 不重复提交到仓库，来源由 npm lockfile 和 grammar lock 共同追溯。

可通过 `MERGEWARDEN_PYTHON_GRAMMAR_WASM` 为 fixture 测试提供路径，但文件必须与固定校验值一致。缺失、被修改或 ABI 不符均报错，不静默跳过，不回退到正则。升级 grammar 需更新固定版本、来源和校验值并重跑测试。

当前测试覆盖不同作用域同名函数、Unicode 及行引用、快照身份、语法错误、不确定调用和 grammar 校验失败。调用统一标记 `unresolved`；尚无导入/别名 resolver、跨文件调用图或增量图存储。装饰器、默认参数和类绑定的作用域语义仍待完善。
