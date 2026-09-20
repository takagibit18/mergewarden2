-- Draft v1 graph schema. No store adapter/migrations are wired yet.
-- Enable FK checks on every SQLite connection. A snapshot becomes queryable only
-- after all facts are committed and state becomes 'ready'.
PRAGMA foreign_keys = ON;
CREATE TABLE graph_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  commit_id TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  grammar_version TEXT NOT NULL,
  resolver_version TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  state TEXT NOT NULL CHECK (state IN ('building','ready','failed'))
);
CREATE TABLE files (
  snapshot_id TEXT NOT NULL REFERENCES graph_snapshots(snapshot_id),
  path TEXT NOT NULL, content_sha256 TEXT NOT NULL, language TEXT NOT NULL,
  parse_status TEXT NOT NULL CHECK (parse_status IN ('complete','incomplete','unsupported')),
  PRIMARY KEY(snapshot_id, path)
);
CREATE TABLE symbols (
  snapshot_id TEXT NOT NULL, symbol_id TEXT NOT NULL, path TEXT NOT NULL,
  qualified_name TEXT NOT NULL, kind TEXT NOT NULL,
  start_line INTEGER NOT NULL CHECK(start_line >= 1),
  end_line INTEGER NOT NULL CHECK(end_line >= start_line),
  PRIMARY KEY(snapshot_id, symbol_id),
  FOREIGN KEY(snapshot_id, path) REFERENCES files(snapshot_id, path)
);
CREATE TABLE call_sites (
  snapshot_id TEXT NOT NULL, call_id TEXT NOT NULL, path TEXT NOT NULL,
  owner_symbol_id TEXT, expression TEXT NOT NULL, source_line INTEGER NOT NULL,
  resolution TEXT NOT NULL CHECK(resolution IN ('resolved_scoped','resolved_import_alias','candidate','unresolved')),
  PRIMARY KEY(snapshot_id, call_id),
  FOREIGN KEY(snapshot_id, path) REFERENCES files(snapshot_id, path),
  FOREIGN KEY(snapshot_id, owner_symbol_id) REFERENCES symbols(snapshot_id, symbol_id)
);
CREATE TABLE relations (
  snapshot_id TEXT NOT NULL, relation_id TEXT NOT NULL,
  source_symbol_id TEXT NOT NULL, target_symbol_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('CONTAINS','IMPORTS','REFERENCES','CALLS')),
  resolution TEXT NOT NULL CHECK(resolution IN ('resolved_scoped','resolved_import_alias','candidate')),
  source_path TEXT NOT NULL, source_line INTEGER NOT NULL, resolver_rule TEXT NOT NULL,
  PRIMARY KEY(snapshot_id, relation_id),
  FOREIGN KEY(snapshot_id, source_symbol_id) REFERENCES symbols(snapshot_id, symbol_id),
  FOREIGN KEY(snapshot_id, target_symbol_id) REFERENCES symbols(snapshot_id, symbol_id),
  FOREIGN KEY(snapshot_id, source_path) REFERENCES files(snapshot_id, path)
);
CREATE INDEX incoming_relations ON relations(snapshot_id, target_symbol_id, kind);
CREATE INDEX outgoing_relations ON relations(snapshot_id, source_symbol_id, kind);
CREATE INDEX symbol_names ON symbols(snapshot_id, qualified_name);
-- Module/import objects and candidate-target tables require a later migration;
-- do not fake module imports as function-call edges.
