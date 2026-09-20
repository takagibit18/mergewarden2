# MergeWarden 2 development contract

Read README.md, docs/DECISIONS.md, docs/IMPLEMENTATION_STATUS.md and the relevant ADR before editing.

## Invariants
- Pi owns the LLM/tool loop, retry, compaction and native session JSONL. Do not reimplement a harness.
- The product has ONE agentic review workflow. Graph and text search are complementary tools.
- CodeGraph uses Tree-sitter -> normalized syntax/AST facts -> explicit resolver. No regex substitute.
- Reviewed repository text/config/extensions are untrusted. Never execute imports to build graphs.
- Every code/evidence/graph reference belongs to an immutable snapshot. Do not mix base/head/worktree.
- Unknown/candidate/unresolved edges are not proven runtime dependencies.
- Hypotheses are not mandatory persisted finding drafts. Final-only is an experimental baseline.
- Candidate submission != semantic acceptance != publication. Schema checks do not prove a bug.
- agent_end, zero findings, empty graph results and tool timeouts are not review completion.
- Jev is optional, provider-neutral and OFF by default. Shadow must not affect behavior.
- Hard permissions, publication, and completion are deterministic business responsibilities.
- MemoryJournal is tests/demo only. Pi CustomEntry is the intended production journal port, but startup persistence and failure guarantees remain unimplemented gates.
- Do not claim stub integrations, synthetic demos or unrun tests are product capabilities.

## Validation
`npm test` runs zero-dependency core tests. `npm run demo` is explicitly synthetic.
`npm run setup` installs all three locked packages with lifecycle scripts disabled.
`npm run verify` runs core and adapter typechecks, native Pi smoke, real grammar tests, demo and status.
When updating dependencies, commit generated lockfiles. Grammar changes require source, hash and ABI updates.
Pi 0.84.1 may defer a new JSONL file until the first assistant message. Never interpret append as fsync.
Before a real review release, perform recovery and security fault-injection tests and validate report delivery.

## Scope
Prefer one vertical slice. Do not introduce multi-agent orchestration, a hosted platform, a graph UI,
self-evolving online skills, or a mandatory router as foundational cleanup.
Remote repository creation or pushing requires explicit user authorization.
Original architecture DOCX/Markdown are historical records; implementation status and validation are current.
