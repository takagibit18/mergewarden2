# MCP reviewer service — deferred

Expose an independent review capability. It is distinct from exporting raw graph tools and delegating review control to the host. No MCP transport or protocol implementation is included.

Reuse the engine boundary in `src/protocol/contracts.ts`; do not fork the review loop.
