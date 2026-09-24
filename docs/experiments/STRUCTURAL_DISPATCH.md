# Structural dispatch experiment

Contract: [ADR 0016](../adr/0016-structural-dispatch.md). Pi stays at the three
existing lockfiles, including pi-coding-agent 0.84.1. Product default is unchanged.

Enable only through ReviewEngine's internal evaluation configuration:

```ts
evaluation: {
  tools: "text+locagent",
  graphMode: "prepared_only",
  routing: "pi_structural_v2_investigate",
  executionStrategy: "dispatch_v1"
}
```

Omitting executionStrategy, or using advisory, retains the old behavior. Dispatch
requires routing and a prepared G1 graph. It does not prepare graphs, invoke another
model, read labels, or launch reserve/formal experiments.

Responsibilities:

| Module | Responsibility |
|---|---|
| Pi structural-routing | Existing signal/threshold decisions; transport bridge |
| dispatch-anchors | Observed changed positions and source-window intersections |
| LocAgent locate | Strict read-only file/name/kind/scope/range metadata lookup |
| dispatch-retrieval | Fixed directions, definite relations, exact generation |
| dispatch-service | Deduplication, bounded candidates, source and exposure lifecycle |
| operations + ReviewEngine | Shared admission, permissions, total budget, cancellation |
| Pi structural-dispatch | Await then native steer message; provider-payload inspection |
| provenance/dispatch | Separate host-dispatch-attribution-1 offline measurement |

Frozen limits are exported as DISPATCH_LIMITS. Every locate, traversal and source
read is a charged operation. Each traversal has 30 nodes/8192 bytes; general
exploration has 3 hops; import inspection selects at most 4 targets. The package
has a 24 KiB ceiling, source windows have 80 lines, and original source hashes are
never reused for sliced text. A route budget can reduce the original 2/4/6 caps.
The pre-existing per-read source ceiling remains 200 lines/32 KiB.

Run manifests keep model tool counters and dispatch operation counters separately.
`graphToolCalls` counts model-issued Graph requests; `graph.calls` includes actual
Graph backend requests from both origins. Dispatch metrics separately include
`sourceReads` (host read requests), `sourceReadOperations` (admitted source service invocations), execution terminals, delivered bytes and host latency. Synthetic
provider token usage is never a real model cost measurement.

Host source is first recorded privately, then placed in a bounded native custom
message. Only exact package text observed in before_provider_request grants final
reference eligibility. submit_review rejects pending context, and the next model
response may submit explicitly chosen IDs. The package includes the entity and
relation path, exact source and EvidenceRef ID. Read source not selected by the
model is never attached automatically. Persistence failure is terminal.

`eval/dispatch-diagnostic.mjs DATASET EXTERNAL_OUTPUT CASE_ID...` copies exact
snapshots, source blobs and published generations into a separate diagnostic state.
It replays existing C read-only observations through the first route activation
(all read-only observations for untriggered controls), using real Pi HTTP
serialization with a scripted response. It compares advisory and dispatch on that
same prefix; it calls no model and makes no semantic submission. Cases, budgets
and prefixes are written before execution. Original snapshots/generations are
hash-checked again afterward. Audit comparison must happen outside this program,
after outputs are frozen. Output must be outside the checkout.

Acceptance runs `npm run verify`, the real Pi dispatch tests and unchanged historical
v3 replay. A successful transport chain does not imply decisive context retrieval,
a correct finding, complete dynamic dispatch, MRO or shared-configuration coverage.
