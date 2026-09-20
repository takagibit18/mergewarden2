# Contributing

MergeWarden 2 is a tested development foundation, not a production reviewer.
Use Node.js 22.19+ and run:

```bash
npm run setup
npm run verify
```

For each change, identify the relevant ADR, implement one vertical slice, add meaningful deterministic tests, update implementation status, and label any checks not executed. Keep the domain independent of external SDKs. `npm test` remains an offline, zero-dependency core suite.

The root and each SDK adapter have independent lockfiles. Update dependencies in the relevant directory with `npm install --ignore-scripts`, then verify from a clean `npm run setup`. Never commit node_modules, credentials, local session logs, or unverified grammar binaries.

CI checks Windows and Linux on Node 22.19.0 and 24.12.0. Tests never require model credentials or paid requests. Synthetic fixtures validate integration behavior, not review quality.

Do not copy upstream implementation code without reviewing license obligations. The project license is still an owner decision; see LICENSE-DECISION.md. Original architecture documents are retained as historical baseline records; current status and validation records govern capability claims.
