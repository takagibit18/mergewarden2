export type Resolution = "resolved_scoped" | "resolved_import_alias" | "candidate" | "unresolved";
export type Relation = "CONTAINS" | "IMPORTS" | "REFERENCES" | "CALLS";
export interface SymbolFact {
  id: string; snapshotId: string; path: string; qualifiedName: string;
  kind: "function" | "class"; startLine: number; endLine: number; parentSymbolId?: string;
}
export interface CallSiteFact {
  id: string; snapshotId: string; path: string; expression: string; startLine: number;
  ownerSymbolId?: string; resolution: Resolution; candidateTargetIds: string[];
}
export interface RelationFact {
  fromId: string; toId: string; relation: Relation; resolution: Resolution;
  sourcePath: string; sourceLine: number; resolverVersion: string;
}
export interface GraphPage<T> {
  status: "ok" | "not_indexed" | "unsupported" | "parse_incomplete" | "error";
  snapshotId: string; items: T[]; truncated: boolean; nextCursor?: string;
  coverage: { indexedFiles: number; eligibleFiles: number; unresolvedCalls: number };
  warnings: string[];
}
export interface CodeGraph {
  lookup(input: { snapshotId: string; query: string; limit: number; cursor?: string }): Promise<GraphPage<SymbolFact>>;
  neighbors(input: { snapshotId: string; symbolId: string; relation: Relation; direction: "incoming" | "outgoing"; limit: number; cursor?: string }): Promise<GraphPage<RelationFact>>;
}
export interface SyntaxFacts {
  symbols: SymbolFact[]; calls: CallSiteFact[]; parseComplete: boolean; diagnostics: string[];
}
export interface LanguageExtractor {
  language: string;
  extract(input: { snapshotId: string; path: string; source: string }): Promise<SyntaxFacts>;
}
