import { createHash } from "node:crypto";
import type { FindingCandidate, EvidenceRef } from "../domain/contracts.ts";
type ObjectValue = Record<string, unknown>;
const object = (v: unknown): v is ObjectValue => typeof v === "object" && v !== null && !Array.isArray(v);
const records = (v: unknown): ObjectValue[] => Array.isArray(v) ? v.filter(object) : [];
const items = (call: ToolCall): ObjectValue[] => records(call.response?.items);
const graph = (call: ToolCall) => call.name === "graph_lookup" || call.name === "graph_neighbors";
const ok = (call: ToolCall, snapshotId: string) => !call.isError && call.response?.snapshotId === snapshotId && ["ok", "parse_incomplete"].includes(String(call.response.status));
const position = (call: ToolCall) => call.resultEvent ?? Infinity;
const overlap = (a: number, b: number, c: number, d: number) => a <= d && c <= b;
const canonical = (v: unknown): string => JSON.stringify(v, (_key, value: unknown) => object(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
export interface ToolCall {
  id: string; name: string; args: ObjectValue; ordinal: number; callEvent: number; callEntryId: string;
  resultEvent?: number; resultEntryId?: string; response?: ObjectValue; resultText: string; isError: boolean;
}
export interface TraceUsage {
  assistantResponses: number; reportedInputTokens: number; reportedOutputTokens: number; reportedTotalTokens: number;
  cacheReadTokens: number; cacheWriteTokens: number; interruptedResponses: number; missingUsageResponses: number; incompleteUsage: boolean;
}
export interface DecodedTrace { sha256: string; calls: ToolCall[]; issues: string[]; ignoredBranchEntries: number; usage: TraceUsage }

/** Read only model-visible tool calls/results from the last native branch. Never read model self-attribution or thinking. */
export function decodePiTrace(jsonl: string): DecodedTrace {
  const trace: DecodedTrace = { sha256: createHash("sha256").update(jsonl).digest("hex"), calls: [], issues: [], ignoredBranchEntries: 0,
    usage: { assistantResponses: 0, reportedInputTokens: 0, reportedOutputTokens: 0, reportedTotalTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, interruptedResponses: 0, missingUsageResponses: 0, incompleteUsage: false } };
  const entries: ObjectValue[] = [];
  for (const [index, line] of jsonl.trim().split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try { const entry: unknown = JSON.parse(line); if (!object(entry)) throw Error(); entries.push(entry); }
    catch { trace.issues.push(`Invalid native JSONL at line ${index + 1}`); }
  }
  const indexed = new Map<string, ObjectValue>();
  for (const entry of entries) if (typeof entry.id === "string") {
    if (indexed.has(entry.id)) trace.issues.push("Duplicate native entry ID");
    indexed.set(entry.id, entry);
  }
  const branch: ObjectValue[] = []; const visited = new Set<string>();
  let entry = entries.findLast(e => typeof e.id === "string");
  while (entry) {
    const id = String(entry.id); if (visited.has(id)) { trace.issues.push("Native branch cycle"); break; }
    visited.add(id); branch.push(entry);
    if (entry.parentId === null || entry.parentId === undefined) break;
    entry = indexed.get(String(entry.parentId)); if (!entry) trace.issues.push("Missing native branch parent");
  }
  if (!branch.length) trace.issues.push("No active native branch");
  trace.ignoredBranchEntries = indexed.size - branch.length; branch.reverse();
  const calls = new Map<string, ToolCall>();
  for (const [event, e] of branch.entries()) {
    if (e.type !== "message" || !object(e.message)) continue;
    const message = e.message;
    if (message.role === "assistant") {
      const usage = message.usage; trace.usage.assistantResponses++;
      if (["aborted", "error"].includes(String(message.stopReason))) trace.usage.interruptedResponses++;
      if (!object(usage) || ![usage.input, usage.output, usage.cacheRead, usage.cacheWrite, usage.totalTokens].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)) trace.usage.missingUsageResponses++;
      else {
        trace.usage.reportedInputTokens += Number(usage.input) + Number(usage.cacheRead) + Number(usage.cacheWrite);
        trace.usage.reportedOutputTokens += Number(usage.output); trace.usage.reportedTotalTokens += Number(usage.totalTokens);
        trace.usage.cacheReadTokens += Number(usage.cacheRead); trace.usage.cacheWriteTokens += Number(usage.cacheWrite);
      }
    }
    if (message.role === "assistant") for (const block of records(message.content)) {
      if (block.type !== "toolCall") continue;
      if (typeof block.id !== "string" || typeof block.name !== "string" || !object(block.arguments) || calls.has(block.id)) { trace.issues.push("Invalid/duplicate tool call"); continue; }
      const call: ToolCall = { id: block.id, name: block.name, args: block.arguments, ordinal: trace.calls.length + 1, callEvent: event, callEntryId: String(e.id), resultText: "", isError: false };
      calls.set(call.id, call); trace.calls.push(call);
    }
    if (message.role === "toolResult") {
      const call = calls.get(String(message.toolCallId));
      if (!call || call.resultEvent !== undefined || call.name !== message.toolName) { trace.issues.push("Orphan/duplicate/mismatched tool result"); continue; }
      call.resultEvent = event; call.resultEntryId = String(e.id); call.isError = message.isError === true;
      call.resultText = records(message.content).filter(b => b.type === "text" && typeof b.text === "string").map(b => String(b.text)).join("\n");
      try {
        const blocks = records(message.content).filter(b => b.type === "text" && typeof b.text === "string");
        // Routing appends advisory context as separate blocks. Only the original
        // JSON block is tool data; guidance never becomes evidence or attribution.
        const routed = blocks.length > 1 && blocks.slice(1).every(b => String(b.text).startsWith("[Structural investigation recommended]\n") || String(b.text).startsWith("Structural investigation is degraded."));
        const response: unknown = JSON.parse(routed ? String(blocks[0]!.text) : call.resultText);
        if (!object(response)) throw Error(); call.response = response;
      }
      catch { trace.issues.push(`Non-JSON tool response: ${call.id}`); }
    }
  }
  trace.usage.incompleteUsage = trace.usage.interruptedResponses > 0 || trace.usage.missingUsageResponses > 0;
  return trace;
}

export type DiscoveryPath = "text_only" | "graph_assisted" | "ambiguous";
export interface AttributionChain {
  neighborCallId: string; neighborToolOrdinal: number; neighborEntryId: string;
  sourceCallId: string; sourceToolOrdinal: number; sourceEntryId: string;
  edgeId: string; callerId: string; path: string; startLine: number; endLine: number;
  resolution: string; novelToText: boolean; competingTextCallIds: string[];
  evidence: EvidenceRef;
}
interface CallerLocation { edgeId: string; callerId: string; path: string; startLine: number; endLine: number; resolution: string }
function callerLocations(call: ToolCall, snapshotId: string): CallerLocation[] {
  if (call.name !== "graph_neighbors" || !ok(call, snapshotId) || call.args.direction !== "incoming" || call.args.relation !== "CALLS") return [];
  return items(call).filter(e => e.snapshotId === snapshotId && typeof e.id === "string" && typeof e.fromId === "string" && e.toId === call.args.symbolId && e.relation === call.args.relation && ["resolved_scoped", "resolved_import_alias"].includes(String(e.resolution)) && typeof e.sourcePath === "string" && Number.isInteger(e.sourceLine) && Number(e.sourceLine) >= 1 && Number.isInteger(e.sourceEndLine) && Number(e.sourceEndLine) >= Number(e.sourceLine))
    .map(e => ({ edgeId: String(e.id), callerId: String(e.fromId), path: String(e.sourcePath), startLine: Number(e.sourceLine), endLine: Number(e.sourceEndLine), resolution: String(e.resolution) }));
}
function sourceMatches(call: ToolCall, evidence: EvidenceRef, snapshotId: string) {
  const page = call.response;
  return call.name === "read_source" && ok(call, snapshotId) && evidence.snapshotId === snapshotId && page?.path === evidence.path && page.revision === evidence.revision && page.startLine === evidence.startLine && page.endLine === evidence.endLine && page.contentSha256 === evidence.contentSha256;
}
function sourceCovers(call: ToolCall, location: CallerLocation, snapshotId: string) {
  const page = call.response;
  return call.name === "read_source" && ok(call, snapshotId) && page?.revision === "head" && page.path === location.path && Number(page.startLine) <= location.startLine && Number(page.endLine) >= location.endLine;
}
/** Conservative path-level novelty: any successful prior textual exposure, in either revision, removes strict credit. */
function exposesPath(call: ToolCall, path: string, snapshotId: string) {
  if (!ok(call, snapshotId)) return false;
  return (["read_source", "read_diff"].includes(call.name) && call.response?.path === path) || (call.name === "search_text" && items(call).some(item => item.path === path));
}
export function analyzeTrace(input: { runKey: string; snapshotId: string; findings: FindingCandidate[]; jsonl: string }) {
  const trace = decodePiTrace(input.jsonl); const calls = trace.calls; const snapshotId = input.snapshotId;
  for (const call of calls) if (call.response?.snapshotId !== undefined && call.response.snapshotId !== snapshotId) trace.issues.push(`Cross-snapshot tool result: ${call.id}`);
  const graphs = calls.filter(graph); const lookups = graphs.filter(c => c.name === "graph_lookup"); const neighbors = graphs.filter(c => c.name === "graph_neighbors");
  const hits = lookups.filter(c => ok(c, snapshotId) && items(c).some(s => s.snapshotId === snapshotId && typeof s.id === "string"));
  const lookupConversions = new Set<string>();
  const lookupLinks: { lookupCallId: string; neighborCallId: string; symbolId: string }[] = [];
  for (const neighbor of neighbors) {
    const lookup = hits.findLast(l => position(l) < neighbor.callEvent && items(l).some(s => s.id === neighbor.args.symbolId));
    if (lookup) { lookupConversions.add(lookup.id); lookupLinks.push({ lookupCallId: lookup.id, neighborCallId: neighbor.id, symbolId: String(neighbor.args.symbolId) }); }
  }
  const returnedNeighbors = neighbors.filter(c => ok(c, snapshotId) && items(c).length > 0);
  const neighborLinks: { neighborCallId: string; sourceCallId: string; path: string; newToText: boolean }[] = [];
  for (const neighbor of returnedNeighbors) for (const row of items(neighbor)) {
    if (row.snapshotId !== snapshotId || typeof row.sourcePath !== "string" || !Number.isInteger(row.sourceLine) || !Number.isInteger(row.sourceEndLine)) continue;
    const location = { edgeId: String(row.id), callerId: String(row.fromId), path: row.sourcePath, startLine: Number(row.sourceLine), endLine: Number(row.sourceEndLine), resolution: String(row.resolution) };
    const source = calls.find(c => c.callEvent > position(neighbor) && sourceCovers(c, location, snapshotId));
    if (source) neighborLinks.push({ neighborCallId: neighbor.id, sourceCallId: source.id, path: location.path, newToText: !calls.some(c => position(c) < position(neighbor) && exposesPath(c, location.path, snapshotId)) });
  }
  const findings = input.findings.map(finding => {
    const submission = calls.find(c => c.name === "submit_review" && !c.isError && c.response?.accepted === true && records(c.args.findings).some(f => f.id === finding.id && canonical(f) === canonical(finding)));
    const chains: AttributionChain[] = [];
    const reads = finding.evidence.map(e => calls.find(c => sourceMatches(c, e, snapshotId) && position(c) < (submission?.callEvent ?? -1)));
    for (const neighbor of neighbors) for (const location of callerLocations(neighbor, snapshotId)) for (const evidence of finding.evidence) {
      if (evidence.revision !== "head" || evidence.path !== location.path || evidence.startLine > location.startLine || evidence.endLine < location.endLine) continue;
      const source = calls.find(c => sourceMatches(c, evidence, snapshotId) && c.callEvent > position(neighbor) && position(c) < (submission?.callEvent ?? -1));
      if (!source || !sourceCovers(source, location, snapshotId)) continue;
      const competitors = calls.filter(c => c.id !== source.id && position(c) < source.callEvent && exposesPath(c, location.path, snapshotId));
      chains.push({ neighborCallId: neighbor.id, neighborToolOrdinal: neighbor.ordinal, neighborEntryId: neighbor.resultEntryId!, sourceCallId: source.id, sourceToolOrdinal: source.ordinal, sourceEntryId: source.resultEntryId!, edgeId: location.edgeId, callerId: location.callerId, path: location.path, startLine: location.startLine, endLine: location.endLine, resolution: location.resolution, novelToText: competitors.length === 0, competingTextCallIds: competitors.map(c => c.id), evidence });
    }
    let discoveryPath: DiscoveryPath = "ambiguous"; let reason: string;
    if (trace.issues.length || !submission || !reads.length || reads.some(r => !r)) reason = "Trace integrity, accepted submission or exact source evidence chain is incomplete";
    else if (chains.some(c => c.novelToText)) { discoveryPath = "graph_assisted"; reason = "Resolved incoming caller/reference was first exposed by neighbors, then a separately issued source read covered it, and accepted finding evidence includes it"; }
    else {
      const beforeSubmit = graphs.filter(g => g.callEvent < submission.callEvent);
      const allReadBeforeGraph = reads.every(r => position(r!) < (beforeSubmit[0]?.callEvent ?? Infinity));
      const relevant = beforeSubmit.some(g => ok(g, snapshotId) && items(g).some(item => finding.evidence.some((e, index) => position(g) < position(reads[index]!) && ((item.path === e.path && overlap(Number(item.startLine), Number(item.endLine), e.startLine, e.endLine)) || (item.sourcePath === e.path && overlap(Number(item.sourceLine), Number(item.sourceEndLine), e.startLine, e.endLine))))));
      const failedGraph = beforeSubmit.some(g => !ok(g, snapshotId));
      if (!beforeSubmit.length || allReadBeforeGraph || (!relevant && !failedGraph)) { discoveryPath = "text_only"; reason = "Accepted evidence was read before Graph, or no observed Graph result led to these evidence locations"; }
      else reason = "Graph touched evidence but strict novel caller → later source read → accepted evidence chain is absent or has competing text discovery";
    }
    return { predictionId: finding.id, discoveryPath, reason, submissionCallId: submission?.id ?? null, sourceCallIds: reads.filter((r): r is ToolCall => !!r).map(r => r.id), chains };
  });
  const graphChars = graphs.reduce((n, c) => n + [...c.resultText].length, 0);
  const count = (name: string) => calls.filter(c => c.name === name).length;
  const numerator = new Set(neighborLinks.map(l => l.neighborCallId)).size;
  return { schemaVersion: 1, attributionVersion: "trace-attribution-2", runKey: input.runKey, snapshotId, traceSha256: trace.sha256, traceIssues: trace.issues, ignoredBranchEntries: trace.ignoredBranchEntries, usage: trace.usage,
    metrics: { toolCalls: calls.length, graphToolCalls: graphs.length, graphResults: graphs.filter(g => g.resultEvent !== undefined).length, firstGraphToolOrdinal: graphs[0]?.ordinal ?? null,
      lookupCalls: lookups.length, lookupSuccessfulCalls: lookups.filter(c => ok(c, snapshotId)).length, lookupHits: hits.length,
      lookupSuccessRate: lookups.length ? lookups.filter(c => ok(c, snapshotId)).length / lookups.length : null, lookupHitRate: lookups.length ? hits.length / lookups.length : null,
      lookupToNeighbors: { converted: lookupConversions.size, eligible: hits.length, rate: hits.length ? lookupConversions.size / hits.length : null },
      neighborsToReadSource: { converted: numerator, eligible: returnedNeighbors.length, rate: returnedNeighbors.length ? numerator / returnedNeighbors.length : null },
      newCallerReadConversions: new Set(neighborLinks.filter(l => l.newToText).map(l => l.neighborCallId)).size,
      searchTextCalls: count("search_text"), readSourceCalls: count("read_source"), rejectedSubmissions: calls.filter(c => c.name === "submit_review" && (c.isError || c.response?.status === "error")).length,
      graphResponseUtf8Bytes: graphs.reduce((n, c) => n + Buffer.byteLength(c.resultText, "utf8"), 0), graphResponseCharacters: graphChars,
      graphResponseTokens: null, graphResponseTokenEstimate: Math.ceil(graphChars / 4), tokenEstimateMethod: "Unicode code points / 4, rounded up; NOT GLM tokenization or billed input tokens; tool response text counted once" },
    lookupLinks, neighborLinks, findings,
    calls: calls.map(c => ({ toolCallId: c.id, name: c.name, ordinal: c.ordinal, callEntryId: c.callEntryId, resultEntryId: c.resultEntryId ?? null, status: c.response?.status ?? (c.response?.accepted ? "accepted" : null), isError: c.isError, resultMissing: c.resultEvent === undefined, returnedItems: items(c).length })) };
}
export type TraceAnalysis = ReturnType<typeof analyzeTrace>;
