import { DatabaseSync } from "node:sqlite";
import { mkdir, open as openFile, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { isolatedState, sha256, writeJson } from "../infrastructure/files.ts";
import { SnapshotStore } from "../snapshot/store.ts";
import { emptyCoverage } from "./contracts.ts";
import type { CodeGraph, GraphCoverage, GraphGenerationState, GraphPage, RelationFact, SymbolFact, SyntaxFacts } from "./contracts.ts";
import { RESOLVER_VERSION, resolvePython } from "./python-resolver.ts";

export const GRAPH_SCHEMA_VERSION = 3;
export const PARSER_VERSION = "web-tree-sitter-0.27.0/python-0.25.0-abi15";
export const GRAPH_POLICY_VERSION = "all-python-checkpoint-1";
export interface GraphBuildBudget { maxFacts: number; maxRelations: number; maxFileFacts: number; maxFileMs: number }
export const DEFAULT_GRAPH_BUDGET: GraphBuildBudget = { maxFacts: 200_000, maxRelations: 400_000, maxFileFacts: 25_000, maxFileMs: 15_000 };
export interface GraphStorageMetrics { generationBytes: number; checkpointBytes: number }
export interface GraphMetrics {
  buildMs: number; queryMs: number; cacheHit: boolean; coverage: GraphCoverage;
  resumedFiles: number; extractedFiles: number; storage: GraphStorageMetrics;
}
interface PublishedManifest {
  manifestVersion: 1; snapshotId: string; cacheIdentity: string; schemaVersion: number;
  resolverVersion: string; parserVersion: string; policyVersion: string; budget: GraphBuildBudget;
  generationId: string; generationState: GraphGenerationState; databaseFile: string; databaseBytes: number;
  coverage: GraphCoverage; warnings: string[];
  counts: { files: number; symbols: number; sites: number; relations: number };
  publishedAt: string;
}
interface CheckpointRow {
  path: string; content_sha256: string; status: "complete" | "incomplete" | "unsupported" | "failed";
  fact_count: number; facts: string | null; diagnostics: string; failure_kind: string | null; failure_reason: string | null;
}
const warning = "HEAD-only static Python graph. Empty results never prove absence; dynamic/external calls may be unresolved. Verify findings using read_source.";
const boundedWarning = (value: string) => value.slice(0, 512);
const graphIdentity = (snapshotId: string, budget: GraphBuildBudget) => sha256(JSON.stringify({ snapshotId, schema: GRAPH_SCHEMA_VERSION, resolver: RESOLVER_VERSION, parser: PARSER_VERSION, policy: GRAPH_POLICY_VERSION, budget }));
export const graphCacheDir = (state: string, snapshotId: string, budget: GraphBuildBudget = DEFAULT_GRAPH_BUDGET) => join(state, "graphs", graphIdentity(snapshotId, budget));
export const graphPublishPath = (state: string, snapshotId: string, budget: GraphBuildBudget = DEFAULT_GRAPH_BUDGET) => join(graphCacheDir(state, snapshotId, budget), "published.json");
export const graphCheckpointPath = (state: string, snapshotId: string, budget: GraphBuildBudget = DEFAULT_GRAPH_BUDGET) => join(graphCacheDir(state, snapshotId, budget), "checkpoint.sqlite");
export const graphBuildLockPath = (state: string, snapshotId: string, budget: GraphBuildBudget = DEFAULT_GRAPH_BUDGET) => join(graphCacheDir(state, snapshotId, budget), "build.lock");
const graphFailurePath = (state: string, snapshotId: string, budget: GraphBuildBudget) => join(graphCacheDir(state, snapshotId, budget), "failure.json");

export class GraphOpenError extends Error {
  readonly status: "building" | "error"; readonly coverage: GraphCoverage; readonly warnings: string[];
  constructor(status: "building" | "error", message: string, coverage = emptyCoverage(), warnings = [message]) { super(message); this.status = status; this.coverage = coverage; this.warnings = warnings; }
}

function assertBudget(budget: GraphBuildBudget): void {
  for (const [key, value] of Object.entries(budget)) if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid graph budget: ${key}`);
}
function factCount(facts: SyntaxFacts): number { return facts.symbols.length + facts.calls.length + facts.references.length + facts.imports.length + facts.scopes.length + facts.bindings.length; }
function dbCount(db: DatabaseSync, table: string): number { return Number((db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number | bigint }).n); }
async function fileBytes(path: string): Promise<number> { try { return (await stat(path)).size; } catch { return 0; } }
async function checkpointBytes(path: string): Promise<number> {
  return (await Promise.all([path, `${path}-wal`, `${path}-shm`].map(fileBytes))).reduce((sum, value) => sum + value, 0);
}
async function readJson<T>(path: string): Promise<T | undefined> { try { return JSON.parse(await readFile(path, "utf8")) as T; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; } }
function generationPath(cacheDir: string, manifest: PublishedManifest): string {
  if (!/^generations\/[a-f0-9-]+\.sqlite$/.test(manifest.databaseFile.replaceAll("\\", "/")) || basename(manifest.databaseFile) !== `${manifest.generationId}.sqlite`) throw new Error("Invalid graph generation manifest path");
  return join(cacheDir, "generations", `${manifest.generationId}.sqlite`);
}
async function readPublished(state: string, snapshotId: string, budget: GraphBuildBudget): Promise<PublishedManifest | undefined> {
  const value = await readJson<PublishedManifest>(graphPublishPath(state, snapshotId, budget));
  if (!value) return;
  const identity = graphIdentity(snapshotId, budget);
  if (value.manifestVersion !== 1 || value.snapshotId !== snapshotId || value.cacheIdentity !== identity || value.schemaVersion !== GRAPH_SCHEMA_VERSION || value.resolverVersion !== RESOLVER_VERSION || value.parserVersion !== PARSER_VERSION || value.policyVersion !== GRAPH_POLICY_VERSION || JSON.stringify(value.budget) !== JSON.stringify(budget)) throw new Error("Graph publish manifest identity mismatch");
  generationPath(graphCacheDir(state, snapshotId, budget), value);
  return value;
}
export async function publishedGraphPath(state: string, snapshotId: string, budget: GraphBuildBudget = DEFAULT_GRAPH_BUDGET): Promise<string> {
  const manifest = await readPublished(state, snapshotId, budget); if (!manifest) throw Object.assign(new Error("No published graph generation"), { code: "ENOENT" });
  return generationPath(graphCacheDir(state, snapshotId, budget), manifest);
}
async function syncFile(path: string): Promise<void> { const handle = await openFile(path, "r+"); try { await handle.sync(); } finally { await handle.close(); } }

async function quarantinePublished(state: string, snapshotId: string, budget: GraphBuildBudget, manifest?: PublishedManifest): Promise<void> {
  const cache = graphCacheDir(state, snapshotId, budget); const quarantine = join(cache, "quarantine"); await mkdir(quarantine, { recursive: true, mode: 0o700 });
  const suffix = `${Date.now()}-${randomUUID()}`;
  if (manifest) await rename(generationPath(cache, manifest), join(quarantine, `${manifest.generationId}-${suffix}.sqlite`)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  await rename(graphPublishPath(state, snapshotId, budget), join(quarantine, `published-${suffix}.json`)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
}

async function acquireBuildLock(path: string, ownerToken: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try {
    const handle = await openFile(path, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify({ pid: process.pid, ownerToken, createdAt: new Date().toISOString() })); await handle.sync(); } finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw new GraphOpenError("building", "Graph build is already in progress; no unpublished checkpoint is queryable.");
  }
}
export async function releaseGraphBuildLock(state: string, snapshotId: string, ownerToken: string, budget: GraphBuildBudget = DEFAULT_GRAPH_BUDGET): Promise<void> {
  const path = graphBuildLockPath(state, snapshotId, budget);
  try { const value = JSON.parse(await readFile(path, "utf8")) as { ownerToken?: string }; if (value.ownerToken === ownerToken) await rm(path, { force: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}

function openCheckpoint(path: string): DatabaseSync {
  const db = new DatabaseSync(path); return db;
}
function checkpointRows(db: DatabaseSync, identity: string): CheckpointRow[] { return db.prepare("SELECT path,content_sha256,status,fact_count,facts,diagnostics,failure_kind,failure_reason FROM file_checkpoints WHERE cache_identity=? ORDER BY path").all(identity) as unknown as CheckpointRow[]; }
function commitCheckpoint(db: DatabaseSync, identity: string, row: CheckpointRow): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT OR REPLACE INTO file_checkpoints(cache_identity,path,content_sha256,status,fact_count,facts,diagnostics,failure_kind,failure_reason,committed_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(identity, row.path, row.content_sha256, row.status, row.fact_count, row.facts, row.diagnostics, row.failure_kind, row.failure_reason, new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) { try { db.exec("ROLLBACK"); } catch { /* preserve original */ } throw error; }
}
function setBuildState(db: DatabaseSync, identity: string, state: "building" | "resolving" | "publishing" | "complete" | "error", failureKind?: string, failureReason?: string): void {
  db.prepare("UPDATE graph_builds SET state=?,failure_kind=?,failure_reason=?,updated_at=? WHERE cache_identity=?").run(state, failureKind ?? null, failureReason ?? null, new Date().toISOString(), identity);
}

/** Immutable, already-published graph generation. */
export class SqliteCodeGraph implements CodeGraph {
  private db: DatabaseSync; private snapshotId: string; private coverage: GraphCoverage; private warnings: string[];
  private generationId: string; private generationState: GraphGenerationState;
  private constructor(db: DatabaseSync, manifest: PublishedManifest) { this.db = db; this.snapshotId = manifest.snapshotId; this.coverage = manifest.coverage; this.warnings = manifest.warnings; this.generationId = manifest.generationId; this.generationState = manifest.generationState; }

  private static async openPublished(state: string, snapshotId: string, budget: GraphBuildBudget, manifest: PublishedManifest): Promise<SqliteCodeGraph> {
    const path = generationPath(graphCacheDir(state, snapshotId, budget), manifest); const info = await stat(path);
    if (info.size !== manifest.databaseBytes) throw new Error("Published graph size changed");
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      db.exec("PRAGMA query_only=ON; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;");
      const meta = db.prepare("SELECT * FROM graph_snapshots WHERE snapshot_id=?").get(snapshotId) as Record<string, unknown> | undefined;
      const validMeta = meta && meta.schema_version === GRAPH_SCHEMA_VERSION && meta.resolver_version === RESOLVER_VERSION && meta.parser_version === PARSER_VERSION && meta.revision === "head" && meta.cache_identity === manifest.cacheIdentity && meta.generation_id === manifest.generationId && meta.state === manifest.generationState && meta.coverage === JSON.stringify(manifest.coverage) && meta.warnings === JSON.stringify(manifest.warnings);
      if (!validMeta || JSON.stringify(db.prepare("PRAGMA quick_check").all()) !== '[{"quick_check":"ok"}]' || db.prepare("PRAGMA foreign_key_check").all().length || dbCount(db, "files") !== manifest.counts.files || dbCount(db, "symbols") !== manifest.counts.symbols || dbCount(db, "sites") !== manifest.counts.sites || dbCount(db, "relations") !== manifest.counts.relations) throw new Error("Published graph validation failed");
      return new SqliteCodeGraph(db, manifest);
    } catch (error) { db.close(); throw error; }
  }

  static async open(store: SnapshotStore, options: { budget?: GraphBuildBudget; ownerToken?: string } = {}): Promise<{ graph: SqliteCodeGraph; metrics: GraphMetrics }> {
    const started = performance.now(); const id = store.manifest.identity.id; const budget = options.budget ?? DEFAULT_GRAPH_BUDGET; assertBudget(budget);
    await isolatedState(store.stateDir, store.manifest.repositoryPath);
    const cache = graphCacheDir(store.stateDir, id, budget); await mkdir(join(cache, "generations"), { recursive: true, mode: 0o700 });
    let published: PublishedManifest | undefined;
    try {
      published = await readPublished(store.stateDir, id, budget);
      if (published) {
        const graph = await this.openPublished(store.stateDir, id, budget, published);
        return { graph, metrics: { buildMs: 0, queryMs: 0, cacheHit: true, coverage: published.coverage, resumedFiles: 0, extractedFiles: 0, storage: { generationBytes: published.databaseBytes, checkpointBytes: await checkpointBytes(graphCheckpointPath(store.stateDir, id, budget)) } } };
      }
    } catch {
      await quarantinePublished(store.stateDir, id, budget, published);
    }
    const knownFailure = await readJson<{ cacheIdentity: string; reason: string; coverage: GraphCoverage; warnings: string[] }>(graphFailurePath(store.stateDir, id, budget));
    if (knownFailure?.cacheIdentity === graphIdentity(id, budget)) throw new GraphOpenError("error", knownFailure.reason, knownFailure.coverage, knownFailure.warnings);

    const ownerToken = options.ownerToken ?? randomUUID(); const lock = graphBuildLockPath(store.stateDir, id, budget); await acquireBuildLock(lock, ownerToken);
    try {
      // A concurrent builder may have published between our first check and lock acquisition.
      const raced = await readPublished(store.stateDir, id, budget);
      if (raced) {
        const graph = await this.openPublished(store.stateDir, id, budget, raced);
        return { graph, metrics: { buildMs: 0, queryMs: 0, cacheHit: true, coverage: raced.coverage, resumedFiles: 0, extractedFiles: 0, storage: { generationBytes: raced.databaseBytes, checkpointBytes: await checkpointBytes(graphCheckpointPath(store.stateDir, id, budget)) } } };
      }
      return await this.build(store, budget, ownerToken, started);
    } finally { await releaseGraphBuildLock(store.stateDir, id, ownerToken, budget); }
  }

  private static async build(store: SnapshotStore, budget: GraphBuildBudget, _ownerToken: string, started: number): Promise<{ graph: SqliteCodeGraph; metrics: GraphMetrics }> {
    const id = store.manifest.identity.id; const identity = graphIdentity(id, budget); const stagingPath = graphCheckpointPath(store.stateDir, id, budget);
    const staging = openCheckpoint(stagingPath); let extractedFiles = 0; let resumedFiles = 0; let extractor: { extract(input: { snapshotId: string; path: string; source: string }, limits?: { maxFacts?: number; deadline?: number }): Promise<SyntaxFacts>; dispose(): void } | undefined;
    try {
      staging.exec(await readFile(new URL("../../schemas/graph-checkpoint.sql", import.meta.url), "utf8"));
      const now = new Date().toISOString();
      staging.prepare("INSERT OR IGNORE INTO graph_builds(cache_identity,snapshot_id,schema_version,resolver_version,parser_version,policy_version,budget,state,attempts,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .run(identity, id, GRAPH_SCHEMA_VERSION, RESOLVER_VERSION, PARSER_VERSION, GRAPH_POLICY_VERSION, JSON.stringify(budget), "building", 0, now, now);
      const build = staging.prepare("SELECT * FROM graph_builds WHERE cache_identity=?").get(identity) as Record<string, unknown>;
      if (build.snapshot_id !== id || build.schema_version !== GRAPH_SCHEMA_VERSION || build.resolver_version !== RESOLVER_VERSION || build.parser_version !== PARSER_VERSION || build.policy_version !== GRAPH_POLICY_VERSION || build.budget !== JSON.stringify(budget)) throw new Error("Checkpoint identity mismatch");
      staging.prepare("UPDATE graph_builds SET state='building',attempts=attempts+1,failure_kind=NULL,failure_reason=NULL,updated_at=? WHERE cache_identity=?").run(now, identity);

      const allPaths = Object.keys(store.manifest.head).filter(path => path.endsWith(".py"));
      const changed = new Set(store.manifest.changedPaths.filter(path => store.manifest.head[path] && path.endsWith(".py")));
      const paths = [...allPaths].sort((a, b) => Number(changed.has(b)) - Number(changed.has(a)) || a.localeCompare(b));
      let rows = checkpointRows(staging, identity);
      for (const row of rows) if (!store.manifest.head[row.path] || store.manifest.head[row.path]!.hash !== row.content_sha256) staging.prepare("DELETE FROM file_checkpoints WHERE cache_identity=? AND path=?").run(identity, row.path);
      rows = checkpointRows(staging, identity); const existing = new Map(rows.map(row => [row.path, row]));
      resumedFiles = rows.filter(row => row.status === "complete" || row.status === "incomplete").length;
      let totalFacts = rows.reduce((sum, row) => sum + row.fact_count, 0); let limitReason: string | undefined;
      const { PythonTreeSitterExtractor } = await import("../../integrations/tree-sitter/src/python-extractor.ts"); extractor = await PythonTreeSitterExtractor.create();
      for (const path of paths) {
        if (existing.has(path)) continue;
        const frozen = store.manifest.head[path]!;
        if (frozen.status !== "text") { commitCheckpoint(staging, identity, { path, content_sha256: frozen.hash, status: "unsupported", fact_count: 0, facts: null, diagnostics: "[]", failure_kind: "invalid_source", failure_reason: "Unsupported snapshot file" }); continue; }
        let facts: SyntaxFacts;
        try { facts = await extractor.extract({ snapshotId: id, path, source: await store.text("head", path) }, { maxFacts: budget.maxFileFacts, deadline: performance.now() + budget.maxFileMs }); }
        catch (error) {
          const reason = error instanceof Error ? error.message : "Extraction failed";
          const deterministic = reason.includes("per-file extraction");
          if (!deterministic) throw error;
          commitCheckpoint(staging, identity, { path, content_sha256: frozen.hash, status: "failed", fact_count: 0, facts: null, diagnostics: "[]", failure_kind: "capacity", failure_reason: boundedWarning(reason) });
          continue;
        }
        const count = factCount(facts);
        if (totalFacts + count > budget.maxFacts) { limitReason = `Graph fact budget reached before ${path}`; break; }
        commitCheckpoint(staging, identity, { path, content_sha256: frozen.hash, status: facts.parseComplete ? "complete" : "incomplete", fact_count: count, facts: JSON.stringify(facts), diagnostics: JSON.stringify(facts.diagnostics), failure_kind: null, failure_reason: null });
        totalFacts += count; extractedFiles++;
      }
      extractor.dispose(); extractor = undefined;
      rows = checkpointRows(staging, identity); const rowMap = new Map(rows.map(row => [row.path, row]));
      const parsed: SyntaxFacts[] = rows.filter(row => (row.status === "complete" || row.status === "incomplete") && row.facts).map(row => JSON.parse(row.facts!) as SyntaxFacts);
      const coverage = emptyCoverage(); coverage.eligibleFiles = paths.length; coverage.plannedFiles = paths.length; coverage.indexedFiles = parsed.length;
      coverage.parseIncompleteFiles = rows.filter(row => row.status === "incomplete").length; coverage.unsupportedFiles = rows.filter(row => row.status === "unsupported").length; coverage.failedFiles = rows.filter(row => row.status === "failed").length;
      coverage.omittedFiles = Math.max(0, paths.length - rows.length); if (limitReason) coverage.limitReason = limitReason;
      const warnings = [warning];
      for (const row of rows) {
        for (const diagnostic of JSON.parse(row.diagnostics) as string[]) if (warnings.length < 50) warnings.push(`${row.path.slice(0, 256)}: ${boundedWarning(diagnostic)}`);
        if (row.failure_reason && warnings.length < 50) warnings.push(`${row.path.slice(0, 256)}: ${boundedWarning(row.failure_reason)}`);
      }
      if (limitReason) warnings.push(`${limitReason}. Only complete committed files were considered for partial publication.`);
      if (coverage.parseIncompleteFiles) warnings.push("Parse-incomplete files contribute declarations but no proven semantic edges.");
      if (coverage.unsupportedFiles || coverage.failedFiles || coverage.omittedFiles) warnings.push("Coverage is partial. Empty caller results cannot establish repository-wide absence.");
      setBuildState(staging, identity, "resolving");
      let resolved;
      try { resolved = resolvePython(parsed); if (resolved.relations.length > budget.maxRelations) throw new Error("Graph relation limit exceeded"); }
      catch (error) {
        const reason = error instanceof Error ? error.message : "Resolver failed"; const deterministic = reason.includes("limit exceeded");
        setBuildState(staging, identity, "error", deterministic ? "capacity" : "internal", boundedWarning(reason));
        if (deterministic) await writeJson(graphFailurePath(store.stateDir, id, budget), { cacheIdentity: identity, kind: "capacity", reason, coverage, warnings: [...warnings, reason], failedAt: new Date().toISOString() });
        throw error;
      }
      for (const call of resolved.facts.flatMap(fact => fact.calls)) {
        if (call.resolution === "candidate") coverage.candidateCalls++; else if (call.resolution === "unresolved") coverage.unresolvedCalls++; else coverage.resolvedCalls++;
      }
      coverage.entityCount = resolved.facts.reduce((sum, fact) => sum + fact.symbols.length, 0); coverage.callSiteCount = resolved.facts.reduce((sum, fact) => sum + fact.calls.length, 0); coverage.relationCount = resolved.relations.length;
      if (coverage.unresolvedCalls || coverage.candidateCalls) warnings.push("Unresolved/candidate calls are excluded from proven CALLS; incoming results are incomplete.");
      const generationState: GraphGenerationState = coverage.parseIncompleteFiles || coverage.unsupportedFiles || coverage.failedFiles || coverage.omittedFiles ? "partial" : "ready"; coverage.generationState = generationState;
      setBuildState(staging, identity, "publishing");

      const generationId = randomUUID(); const cache = graphCacheDir(store.stateDir, id, budget); const candidate = join(cache, "generations", `${generationId}.sqlite`);
      const counts: PublishedManifest["counts"] = {
        files: paths.length,
        symbols: resolved.facts.reduce((sum, fact) => sum + fact.symbols.length, 0),
        sites: resolved.facts.reduce((sum, fact) => sum + fact.calls.length + fact.references.length + fact.imports.length, 0),
        relations: resolved.relations.length,
      };
      const db = new DatabaseSync(candidate);
      try {
        db.exec(await readFile(new URL("../../schemas/graph.sql", import.meta.url), "utf8")); db.exec("BEGIN IMMEDIATE");
        db.prepare("INSERT INTO graph_snapshots VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, GRAPH_SCHEMA_VERSION, RESOLVER_VERSION, PARSER_VERSION, "head", generationState, identity, generationId, JSON.stringify(coverage), JSON.stringify(warnings), counts.files, counts.symbols, counts.sites, counts.relations, new Date().toISOString());
        const fileInsert = db.prepare("INSERT INTO files VALUES(?,?,?,?,?)"); const symbolInsert = db.prepare("INSERT INTO symbols VALUES(?,?,?,?,?,?,?)");
        const siteInsert = db.prepare("INSERT INTO sites VALUES(?,?,?,?,?,?)"); const relationInsert = db.prepare("INSERT INTO relations VALUES(?,?,?,?,?,?)");
        for (const path of paths) {
          const row = rowMap.get(path); const status = row?.status ?? "omitted"; fileInsert.run(id, path, store.manifest.head[path]!.hash, status, row?.facts ?? null);
          if (!row?.facts) continue; const fact = JSON.parse(row.facts) as SyntaxFacts;
          for (const symbol of fact.symbols) symbolInsert.run(id, symbol.id, symbol.path, symbol.name, symbol.qualifiedName, symbol.kind, JSON.stringify(symbol));
          for (const site of [...fact.calls, ...fact.references, ...fact.imports]) siteInsert.run(id, site.id, site.path, site.kind, "resolution" in site ? site.resolution : null, JSON.stringify(site));
        }
        for (const edge of resolved.relations) relationInsert.run(id, edge.id, edge.fromId, edge.toId, edge.relation, JSON.stringify(edge));
        if (db.prepare("PRAGMA foreign_key_check").all().length || dbCount(db, "files") !== counts.files || dbCount(db, "symbols") !== counts.symbols || dbCount(db, "sites") !== counts.sites || dbCount(db, "relations") !== counts.relations || counts.symbols !== coverage.entityCount || counts.relations !== coverage.relationCount) throw new Error("Graph integrity check failed");
        db.exec("COMMIT");
      } catch (error) { try { db.exec("ROLLBACK"); } catch { /* preserve original */ } db.close(); await rm(candidate, { force: true }); throw error; }
      db.close(); await syncFile(candidate); const databaseBytes = await fileBytes(candidate);
      const manifest: PublishedManifest = { manifestVersion: 1, snapshotId: id, cacheIdentity: identity, schemaVersion: GRAPH_SCHEMA_VERSION, resolverVersion: RESOLVER_VERSION, parserVersion: PARSER_VERSION, policyVersion: GRAPH_POLICY_VERSION, budget, generationId, generationState, databaseFile: `generations/${generationId}.sqlite`, databaseBytes, coverage, warnings, counts, publishedAt: new Date().toISOString() };
      await writeJson(graphPublishPath(store.stateDir, id, budget), manifest); setBuildState(staging, identity, "complete"); staging.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      const graph = await this.openPublished(store.stateDir, id, budget, manifest);
      return { graph, metrics: { buildMs: performance.now() - started, queryMs: 0, cacheHit: false, coverage, resumedFiles, extractedFiles, storage: { generationBytes: databaseBytes, checkpointBytes: await checkpointBytes(stagingPath) } } };
    } finally { extractor?.dispose(); staging.close(); }
  }

  close(): void { this.db.close(); }
  private page<T>(input: { snapshotId: string; limit: number; cursor?: string }, key: unknown, query: (offset: number) => T[]): GraphPage<T> {
    if (input.snapshotId !== this.snapshotId) throw new Error("Graph snapshot mismatch");
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new Error("Graph limit must be 1..100");
    const fingerprint = sha256(JSON.stringify([this.snapshotId, this.generationId, GRAPH_SCHEMA_VERSION, RESOLVER_VERSION, key])); let offset = 0;
    if (input.cursor) {
      if (input.cursor.length > 256) throw new Error("Invalid graph cursor"); const parsed = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
      if (parsed.key !== fingerprint || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0) throw new Error("Graph cursor belongs to another query/snapshot/generation"); offset = parsed.offset;
    }
    const rows = query(offset); const items: T[] = []; let bytes = 0;
    for (const row of rows.slice(0, input.limit)) { const itemBytes = Buffer.byteLength(JSON.stringify(row)); if (bytes + itemBytes > 32_768) break; items.push(row); bytes += itemBytes; }
    if (!items.length && rows.length) throw new Error("Graph item exceeds output limit"); const truncated = rows.length > items.length;
    const status = this.coverage.parseIncompleteFiles ? "parse_incomplete" : this.generationState === "partial" ? "partial" : this.coverage.unsupportedFiles || !this.coverage.eligibleFiles ? "unsupported" : "ok";
    return { snapshotId: this.snapshotId, revision: "head", status, generationId: this.generationId, generationState: this.generationState, items, truncated, ...(truncated ? { nextCursor: Buffer.from(JSON.stringify({ key: fingerprint, offset: offset + items.length })).toString("base64url") } : {}), coverage: this.coverage, warnings: this.warnings };
  }
  async lookup(input: Parameters<CodeGraph["lookup"]>[0]): Promise<GraphPage<SymbolFact>> {
    if (!input.query.trim() || input.query.length > 256) throw new Error("Invalid graph lookup");
    return this.page(input, ["lookup", input.query], offset => this.db.prepare("SELECT payload FROM symbols WHERE snapshot_id=? AND (name=? OR qualified_name=?) ORDER BY symbol_id LIMIT ? OFFSET ?").all(this.snapshotId, input.query, input.query, input.limit + 1, offset).map(row => JSON.parse(String(row.payload)) as SymbolFact));
  }
  async neighbors(input: Parameters<CodeGraph["neighbors"]>[0]): Promise<GraphPage<RelationFact>> {
    if (!["CONTAINS", "IMPORTS", "REFERENCES", "CALLS"].includes(input.relation) || !["incoming", "outgoing"].includes(input.direction)) throw new Error("Invalid graph relation/direction");
    if (!this.db.prepare("SELECT 1 FROM symbols WHERE snapshot_id=? AND symbol_id=?").get(this.snapshotId, input.symbolId)) throw new Error("Symbol is not in this snapshot/generation");
    const column = input.direction === "incoming" ? "target_symbol_id" : "source_symbol_id";
    return this.page(input, ["neighbors", input.symbolId, input.relation, input.direction], offset => this.db.prepare(`SELECT payload FROM relations WHERE snapshot_id=? AND ${column}=? AND kind=? ORDER BY relation_id LIMIT ? OFFSET ?`).all(this.snapshotId, input.symbolId, input.relation, input.limit + 1, offset).map(row => JSON.parse(String(row.payload)) as RelationFact));
  }
}

export async function graphBuildAudit(state: string, snapshotId: string, budget: GraphBuildBudget = DEFAULT_GRAPH_BUDGET): Promise<{ attempts: number; files: { path: string; status: string; factCount: number }[] }> {
  const path = graphCheckpointPath(state, snapshotId, budget); const db = new DatabaseSync(path, { readOnly: true });
  try { const identity = graphIdentity(snapshotId, budget); const build = db.prepare("SELECT attempts FROM graph_builds WHERE cache_identity=?").get(identity) as { attempts: number }; const rows = db.prepare("SELECT path,status,fact_count FROM file_checkpoints WHERE cache_identity=? ORDER BY path").all(identity) as unknown as { path: string; status: string; fact_count: number }[]; return { attempts: Number(build.attempts), files: rows.map(row => ({ path: row.path, status: row.status, factCount: Number(row.fact_count) })) }; }
  finally { db.close(); }
}

export async function pruneUnpublishedGenerations(state: string, snapshotId: string, budget: GraphBuildBudget = DEFAULT_GRAPH_BUDGET): Promise<void> {
  const manifest = await readPublished(state, snapshotId, budget); const directory = join(graphCacheDir(state, snapshotId, budget), "generations");
  let entries: string[]; try { entries = await readdir(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  for (const entry of entries) if (/^[a-f0-9-]+\.sqlite$/.test(entry) && entry !== `${manifest?.generationId}.sqlite`) await rm(join(directory, entry), { force: true });
}
