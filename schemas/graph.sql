-- v3 generation database. A generation is immutable after publication.
-- Extraction checkpoints live in a separate staging database and are never queried.
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = DELETE;
PRAGMA synchronous = FULL;
CREATE TABLE graph_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK(schema_version = 3),
  resolver_version TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  revision TEXT NOT NULL CHECK(revision = 'head'),
  state TEXT NOT NULL CHECK(state IN ('ready','partial')),
  cache_identity TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  coverage TEXT NOT NULL,
  warnings TEXT NOT NULL,
  file_count INTEGER NOT NULL,
  symbol_count INTEGER NOT NULL,
  site_count INTEGER NOT NULL,
  relation_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE files (
  snapshot_id TEXT NOT NULL REFERENCES graph_snapshots(snapshot_id), path TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  parse_status TEXT NOT NULL CHECK(parse_status IN ('complete','incomplete','unsupported','omitted','failed')),
  facts TEXT,
  PRIMARY KEY(snapshot_id,path)
);
CREATE TABLE symbols (
  snapshot_id TEXT NOT NULL, symbol_id TEXT NOT NULL, path TEXT NOT NULL, name TEXT NOT NULL,
  qualified_name TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL,
  PRIMARY KEY(snapshot_id,symbol_id), FOREIGN KEY(snapshot_id,path) REFERENCES files(snapshot_id,path)
);
CREATE TABLE sites (
  snapshot_id TEXT NOT NULL, site_id TEXT NOT NULL, path TEXT NOT NULL, kind TEXT NOT NULL,
  resolution TEXT, payload TEXT NOT NULL, PRIMARY KEY(snapshot_id,site_id),
  FOREIGN KEY(snapshot_id,path) REFERENCES files(snapshot_id,path)
);
CREATE TABLE relations (
  snapshot_id TEXT NOT NULL, relation_id TEXT NOT NULL, source_symbol_id TEXT NOT NULL,
  target_symbol_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('CONTAINS','IMPORTS','REFERENCES','CALLS')),
  payload TEXT NOT NULL, PRIMARY KEY(snapshot_id,relation_id),
  FOREIGN KEY(snapshot_id,source_symbol_id) REFERENCES symbols(snapshot_id,symbol_id),
  FOREIGN KEY(snapshot_id,target_symbol_id) REFERENCES symbols(snapshot_id,symbol_id)
);
CREATE INDEX incoming_relations ON relations(snapshot_id,target_symbol_id,kind,relation_id);
CREATE INDEX outgoing_relations ON relations(snapshot_id,source_symbol_id,kind,relation_id);
CREATE INDEX symbol_names ON symbols(snapshot_id,name,qualified_name,symbol_id);
