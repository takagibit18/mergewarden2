import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { sha256, isolatedState } from "../infrastructure/files.ts";
import { SnapshotStore } from "../snapshot/store.ts";
import { emptyCoverage } from "./contracts.ts";
import type { CodeGraph, GraphCoverage, GraphPage, RelationFact, SymbolFact, SyntaxFacts } from "./contracts.ts";
import { RESOLVER_VERSION, resolvePython } from "./python-resolver.ts";
export const GRAPH_SCHEMA_VERSION = 2;
export const PARSER_VERSION = "web-tree-sitter-0.27.0/python-0.25.0-abi15";
export interface GraphMetrics { buildMs: number; queryMs: number; cacheHit: boolean; coverage: GraphCoverage }
export const graphPath = (state: string, snapshotId: string) => join(state, "graphs", `${sha256(JSON.stringify([snapshotId, GRAPH_SCHEMA_VERSION, RESOLVER_VERSION]))}.sqlite`);
const warning = "HEAD-only static Python graph. Empty results never prove absence; dynamic/external calls may be unresolved. Verify findings using read_source.";
/** Runs in a terminable worker. SQL strings are application-owned and parameters are bound. */
export class SqliteCodeGraph implements CodeGraph {
  private db: DatabaseSync; private snapshotId: string; private coverage: GraphCoverage; private warnings: string[];
  private constructor(db: DatabaseSync, snapshotId: string, coverage: GraphCoverage, warnings: string[]) { this.db = db; this.snapshotId = snapshotId; this.coverage = coverage; this.warnings = warnings; }
  private static digest(db: DatabaseSync): string {
    return sha256(JSON.stringify([db.prepare("SELECT snapshot_id,schema_version,resolver_version,parser_version,revision,coverage,warnings FROM graph_snapshots ORDER BY snapshot_id").all(), ...["files", "symbols", "sites", "relations"].map(table => db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all())]));
  }
  static async open(store: SnapshotStore): Promise<{ graph: SqliteCodeGraph; metrics: GraphMetrics }> {
    const started = performance.now(); const id = store.manifest.identity.id;
    await isolatedState(store.stateDir, store.manifest.repositoryPath);
    const path = graphPath(store.stateDir, id); await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(path); db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;");
      const meta = db.prepare("SELECT * FROM graph_snapshots WHERE snapshot_id=?").get(id);
      if (meta?.state === "ready" && meta.schema_version === GRAPH_SCHEMA_VERSION && meta.resolver_version === RESOLVER_VERSION && meta.parser_version === PARSER_VERSION && meta.revision === "head" &&
        JSON.stringify(db.prepare("PRAGMA quick_check").all()) === '[{"quick_check":"ok"}]' && db.prepare("PRAGMA foreign_key_check").all().length === 0 && meta.content_digest === this.digest(db)) {
        const coverage = JSON.parse(String(meta.coverage)) as GraphCoverage; const warnings = JSON.parse(String(meta.warnings)) as string[];
        return { graph: new SqliteCodeGraph(db, id, coverage, warnings), metrics: { buildMs: 0, queryMs: 0, cacheHit: true, coverage } };
      }
    } catch { /* Unavailable, incomplete or corrupt derived data is rebuilt from the snapshot. */ }
    db?.close();
    // Keep a damaged/interrupted index for diagnosis; never query it as ready.
    await rename(path, `${path}.${randomUUID()}.discarded`).catch((e: NodeJS.ErrnoException) => { if (e.code !== "ENOENT") throw e; });
    db = new DatabaseSync(path); db.exec(await readFile(new URL("../../schemas/graph.sql", import.meta.url), "utf8"));
    const coverage = emptyCoverage(); const warnings = [warning];
    db.prepare("INSERT INTO graph_snapshots VALUES(?,?,?,?,?,?,?,?,?)").run(id, GRAPH_SCHEMA_VERSION, RESOLVER_VERSION, PARSER_VERSION, "head", "building", JSON.stringify(coverage), JSON.stringify(warnings), null);
    try {
      const paths = Object.keys(store.manifest.head).filter(p => p.endsWith(".py")).sort(); coverage.eligibleFiles = paths.length;
      const inputs: SyntaxFacts[] = [];
      // Dynamic import only on cold graph build: text-only reviews require no grammar or SQLite adapter load.
      const { PythonTreeSitterExtractor } = await import("../../integrations/tree-sitter/src/python-extractor.ts");
      const extractor = await PythonTreeSitterExtractor.create();
      let count = 0;
      try {
        for (const path of paths) {
          if (store.manifest.head[path]!.status !== "text") { coverage.unsupportedFiles++; if (warnings.length < 50) warnings.push(`${path.slice(0, 256)}: unsupported snapshot file`); continue; }
          const facts = await extractor.extract({ snapshotId: id, path, source: await store.text("head", path) });
          count += facts.symbols.length + facts.calls.length + facts.references.length + facts.imports.length;
          if (count > 200_000) throw new Error("Graph fact limit exceeded");
          inputs.push(facts); coverage.indexedFiles++;
          if (!facts.parseComplete) coverage.parseIncompleteFiles++;
          for (const diagnostic of facts.diagnostics) if (warnings.length < 50) warnings.push(`${path.slice(0, 256)}: ${diagnostic}`);
        }
      } finally { extractor.dispose(); }
      const resolved = resolvePython(inputs);
      for (const call of resolved.facts.flatMap(f => f.calls)) {
        if (call.resolution === "candidate") coverage.candidateCalls++;
        else if (call.resolution === "unresolved") coverage.unresolvedCalls++;
        else coverage.resolvedCalls++;
      }
      if (coverage.parseIncompleteFiles) warnings.push("Parse-incomplete files contribute declarations but no proven semantic edges.");
      if (coverage.unsupportedFiles) warnings.push(`${coverage.unsupportedFiles} eligible Python files could not be indexed. Detail warnings are limited to 50 entries.`);
      if (coverage.unresolvedCalls || coverage.candidateCalls) warnings.push("Unresolved/candidate calls are excluded from proven CALLS; incoming results are incomplete.");
      db.exec("BEGIN IMMEDIATE");
      const fileInsert = db.prepare("INSERT INTO files VALUES(?,?,?,?,?)");
      const symbolInsert = db.prepare("INSERT INTO symbols VALUES(?,?,?,?,?,?,?)");
      const siteInsert = db.prepare("INSERT INTO sites VALUES(?,?,?,?,?,?)");
      const relationInsert = db.prepare("INSERT INTO relations VALUES(?,?,?,?,?,?)");
      const factsByPath = new Map(resolved.facts.map(f => [f.symbols[0]!.path, f]));
      for (const path of paths) {
        const f = factsByPath.get(path);
        fileInsert.run(id, path, store.manifest.head[path]!.hash, f ? f.parseComplete ? "complete" : "incomplete" : "unsupported", JSON.stringify(f ?? null));
        if (!f) continue;
        for (const s of f.symbols) symbolInsert.run(id, s.id, s.path, s.name, s.qualifiedName, s.kind, JSON.stringify(s));
        for (const site of [...f.calls, ...f.references, ...f.imports]) siteInsert.run(id, site.id, site.path, site.kind, "resolution" in site ? site.resolution : null, JSON.stringify(site));
      }
      for (const edge of resolved.relations) relationInsert.run(id, edge.id, edge.fromId, edge.toId, edge.relation, JSON.stringify(edge));
      if (db.prepare("PRAGMA foreign_key_check").all().length || Number(db.prepare("SELECT count(*) AS n FROM files").get()!.n) !== paths.length) throw new Error("Graph integrity check failed");
      db.prepare("UPDATE graph_snapshots SET coverage=?, warnings=? WHERE snapshot_id=?").run(JSON.stringify(coverage), JSON.stringify(warnings), id);
      const digest = this.digest(db);
      db.prepare("UPDATE graph_snapshots SET state='ready', content_digest=? WHERE snapshot_id=?").run(digest, id);
      db.exec("COMMIT");
      return { graph: new SqliteCodeGraph(db, id, coverage, warnings), metrics: { buildMs: performance.now() - started, queryMs: 0, cacheHit: false, coverage } };
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* Build can fail before transaction starts. */ }
      db.prepare("UPDATE graph_snapshots SET state='error' WHERE snapshot_id=?").run(id); db.close(); throw error;
    }
  }
  close(): void { this.db.close(); }
  private page<T>(input: { snapshotId: string; limit: number; cursor?: string }, key: unknown, query: (offset: number) => T[]): GraphPage<T> {
    if (input.snapshotId !== this.snapshotId) throw new Error("Graph snapshot mismatch");
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new Error("Graph limit must be 1..100");
    const fingerprint = sha256(JSON.stringify([this.snapshotId, GRAPH_SCHEMA_VERSION, RESOLVER_VERSION, key]));
    let offset = 0;
    if (input.cursor) {
      if (input.cursor.length > 256) throw new Error("Invalid graph cursor");
      const parsed = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
      if (parsed.key !== fingerprint || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0) throw new Error("Graph cursor belongs to another query/snapshot");
      offset = parsed.offset;
    }
    const rows = query(offset); const items: T[] = []; let bytes = 0;
    for (const row of rows.slice(0, input.limit)) { const size = Buffer.byteLength(JSON.stringify(row)); if (bytes + size > 32_768) break; items.push(row); bytes += size; }
    if (!items.length && rows.length) throw new Error("Graph item exceeds output limit");
    const truncated = rows.length > items.length;
    return { snapshotId: this.snapshotId, revision: "head", status: this.coverage.parseIncompleteFiles ? "parse_incomplete" : this.coverage.unsupportedFiles || !this.coverage.eligibleFiles ? "unsupported" : "ok",
      items, truncated, ...(truncated ? { nextCursor: Buffer.from(JSON.stringify({ key: fingerprint, offset: offset + items.length })).toString("base64url") } : {}), coverage: this.coverage, warnings: this.warnings };
  }
  async lookup(input: Parameters<CodeGraph["lookup"]>[0]): Promise<GraphPage<SymbolFact>> {
    if (!input.query.trim() || input.query.length > 256) throw new Error("Invalid graph lookup");
    return this.page(input, ["lookup", input.query], offset => this.db.prepare("SELECT payload FROM symbols WHERE snapshot_id=? AND (name=? OR qualified_name=?) ORDER BY symbol_id LIMIT ? OFFSET ?").all(this.snapshotId, input.query, input.query, input.limit + 1, offset).map(r => JSON.parse(String(r.payload))));
  }
  async neighbors(input: Parameters<CodeGraph["neighbors"]>[0]): Promise<GraphPage<RelationFact>> {
    if (!["CONTAINS", "IMPORTS", "REFERENCES", "CALLS"].includes(input.relation) || !["incoming", "outgoing"].includes(input.direction)) throw new Error("Invalid graph relation/direction");
    if (!this.db.prepare("SELECT 1 FROM symbols WHERE snapshot_id=? AND symbol_id=?").get(this.snapshotId, input.symbolId)) throw new Error("Symbol is not in this snapshot");
    const column = input.direction === "incoming" ? "target_symbol_id" : "source_symbol_id";
    return this.page(input, ["neighbors", input.symbolId, input.relation, input.direction], offset => this.db.prepare(`SELECT payload FROM relations WHERE snapshot_id=? AND ${column}=? AND kind=? ORDER BY relation_id LIMIT ? OFFSET ?`).all(this.snapshotId, input.symbolId, input.relation, input.limit + 1, offset).map(r => JSON.parse(String(r.payload))));
  }
}
