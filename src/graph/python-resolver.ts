import { sha256 } from "../infrastructure/files.ts";
import type { BindingFact, ImportFact, ReferenceFact, RelationFact, Resolution, SourceFact, SymbolFact, SyntaxFacts } from "./contracts.ts";
export const RESOLVER_VERSION = "python-scopes-2";
export interface ResolvedGraph { facts: SyntaxFacts[]; relations: RelationFact[] }
/** Static repository-root imports only. Never searches for same-name symbols globally. */
export function resolvePython(input: SyntaxFacts[]): ResolvedGraph {
  // The resolver owns these deserialized checkpoint objects. Mutating call resolution avoids
  // cloning the repository-wide fact set at peak memory.
  const facts = input; const symbols = new Map(facts.flatMap(f => f.symbols).map(s => [s.id, s]));
  const scopes = new Map(facts.flatMap(f => f.scopes).map(s => [s.id, s]));
  const imports = new Map(facts.flatMap(f => f.imports).map(i => [i.id, i]));
  const incomplete = new Set(facts.filter(f => !f.parseComplete).flatMap(f => f.symbols.map(s => s.id)));
  const bindings = new Map<string, BindingFact[]>();
  for (const b of facts.flatMap(f => f.bindings)) { const key = `${b.scopeId}:${b.name}`; bindings.set(key, [...bindings.get(key) ?? [], b]); }
  const modules = new Map<string, SymbolFact[]>();
  for (const s of symbols.values()) if (s.kind === "module") modules.set(s.qualifiedName, [...modules.get(s.qualifiedName) ?? [], s]);
  const relations: RelationFact[] = [];
  const edge = (fromId: string, toId: string, relation: RelationFact["relation"], at: SourceFact, resolution: Resolution) => {
    if (relations.length >= 400_000) throw new Error("Graph relation limit exceeded");
    relations.push({ id: sha256(JSON.stringify([at.snapshotId, fromId, toId, relation, at.id, RESOLVER_VERSION])), snapshotId: at.snapshotId, fromId, toId, relation, resolution,
      sourcePath: at.path, sourceLine: at.startLine, sourceEndLine: at.endLine, sourceColumn: at.startColumn, sourceEndColumn: at.endColumn, siteId: at.id, resolverVersion: RESOLVER_VERSION });
  };
  type Target = { ids: string[]; resolution: Resolution };
  const unknown = (): Target => ({ ids: [], resolution: "unresolved" });
  const moduleFor = (name: string) => (modules.get(name) ?? []).filter(m => !incomplete.has(m.id));
  const absolute = (imp: ImportFact, name: string): string | undefined => {
    if (!imp.relativeLevel) return name;
    const owner = facts.find(f => f.imports.some(i => i.id === imp.id))?.symbols.find(s => s.kind === "module"); if (!owner) return;
    const pkg = owner.qualifiedName.split("."); if (!owner.path.endsWith("/__init__.py")) pkg.pop();
    if (imp.relativeLevel > pkg.length) return;
    return [...pkg.slice(0, pkg.length - imp.relativeLevel + 1), ...(name ? name.split(".") : [])].join(".");
  };
  const resolveBindings = (bs: BindingFact[], seen: Set<string>): Target => {
    if (!bs.length || bs.some(b => b.kind === "unknown")) return unknown();
    const targets = bs.map(b => b.kind === "definition" ? { ids: b.targetId && !incomplete.has(b.targetId) ? [b.targetId] : [], resolution: "resolved_scoped" as Resolution } : resolveImport(imports.get(b.targetId!)!, seen));
    const ids = [...new Set(targets.flatMap(t => t.ids))]; if (!ids.length) return unknown();
    return { ids, resolution: bs.length !== 1 || bs.some(b => b.conditional) || targets.some(t => t.resolution === "candidate" || !t.ids.length) ? "candidate" : targets[0]!.resolution };
  };
  const member = (moduleName: string, name: string, seen: Set<string>): Target => {
    const owners = moduleFor(moduleName); if (owners.length !== 1 || scopes.get(owners[0]!.id)?.opaque) return unknown();
    const bs = bindings.get(`${owners[0]!.id}:${name}`); if (bs) return resolveBindings(bs, seen);
    const children = moduleFor(`${moduleName}.${name}`);
    return { ids: children.map(m => m.id), resolution: children.length === 1 ? "resolved_import_alias" : children.length ? "candidate" : "unresolved" };
  };
  const resolveImport = (imp: ImportFact, seen: Set<string>): Target => {
    if (!imp || seen.has(imp.id)) return unknown(); const visited = new Set(seen).add(imp.id);
    const name = absolute(imp, imp.boundModule); if (name === undefined) return unknown();
    if (imp.importedName) { const result = member(name, imp.importedName, visited); return { ...result, resolution: result.resolution === "resolved_scoped" ? "resolved_import_alias" : result.resolution }; }
    const found = moduleFor(name); return { ids: found.map(m => m.id), resolution: found.length === 1 ? "resolved_import_alias" : found.length ? "candidate" : "unresolved" };
  };
  const resolveSite = (site: ReferenceFact): Target => {
    if (!site.parts.length || incomplete.has(site.ownerSymbolId)) return unknown();
    let scopeId: string | undefined = site.ownerSymbolId; let found: Target = unknown();
    while (scopeId) {
      const scope = scopes.get(scopeId); if (!scope || scope.opaque) return unknown();
      const bs = bindings.get(`${scopeId}:${site.parts[0]}`);
      if (bs) {
        if (scopeId === site.ownerSymbolId && bs.some(b => b.startLine > site.startLine || (b.startLine === site.startLine && b.startColumn > site.startColumn))) return unknown();
        found = resolveBindings(bs, new Set());
        break;
      }
      scopeId = scope.lookupParentId;
    }
    for (const name of site.parts.slice(1)) {
      if (found.ids.length !== 1 || found.resolution !== "resolved_import_alias") return unknown();
      const owner = symbols.get(found.ids[0]!); if (owner?.kind !== "module") return unknown();
      const result = member(owner.qualifiedName, name, new Set()); found = { ...result, resolution: result.resolution === "resolved_scoped" ? "resolved_import_alias" : result.resolution };
    }
    return found;
  };
  for (const s of symbols.values()) if (s.parentSymbolId) edge(s.parentSymbolId, s.id, "CONTAINS", s, "resolved_scoped");
  for (const f of facts) {
    for (const imp of f.imports) {
      if (!f.parseComplete || scopes.get(imp.scopeId)?.opaque) continue;
      // IMPORTS records the explicitly imported module; its local binding may be the root package.
      const importedModules = moduleFor(absolute(imp, imp.module) ?? "");
      const result: Target = imp.importedName ? resolveImport(imp, new Set()) : { ids: importedModules.map(m=>m.id), resolution: importedModules.length === 1 ? "resolved_import_alias" : importedModules.length ? "candidate" : "unresolved" };
      const conditional = (bindings.get(`${imp.scopeId}:${imp.alias}`) ?? []).some(b=>b.targetId===imp.id && b.conditional);
      for (const id of result.ids) edge(imp.scopeId, id, "IMPORTS", imp, conditional ? "candidate" : result.resolution);
    }
    for (const site of [...f.calls, ...f.references]) {
      let result = f.parseComplete ? resolveSite(site) : unknown();
      if (site.kind === "call" && result.ids.some(id => symbols.get(id)?.kind === "module")) result = unknown();
      site.resolution = result.resolution; site.candidateTargetIds = result.ids;
      for (const id of result.ids) {
        edge(site.ownerSymbolId, id, "REFERENCES", site, result.resolution);
        if (site.kind === "call" && result.resolution !== "candidate" && ["function", "method", "class"].includes(symbols.get(id)!.kind)) edge(site.ownerSymbolId, id, "CALLS", site, result.resolution);
      }
    }
  }
  return { facts, relations: relations.sort((a, b) => a.id.localeCompare(b.id)) };
}
