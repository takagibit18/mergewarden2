import {classifyPythonPath} from '../../graph/scope-policy.ts';
import type {CandidateUnit} from './path-candidates.ts';
import type {RetainedGraph} from './path-retention.ts';

export const CANDIDATE_SLOTS = 3;
export interface SelectionContext {
  snapshotId: string; generationId: string; route: string;
  changedPaths: readonly string[];
  visibleRanges: readonly {path: string; startLine: number; endLine: number}[];
}
export interface PathCandidate extends CandidateUnit {
  terminalEntityId: string;
  sourceRange: {startLine: number; endLine: number};
  entityKind: string; patternIds: string[]; relationSequences: string[][];
  rootEntityIds: string[]; rootPaths: string[];
  distinctPredecessorCount: number; pathSupportCount: number;
  changed: boolean; classification: string; alreadyVisible: boolean; sameRootFile: boolean;
  buckets: {depth: 'shallow'|'multi_hop'; file: 'root_file'|'cross_file'; visibility: 'already_visible'|'unseen'; change: 'changed'|'untouched'};
}
const cmp = (a: string,b: string) => a < b ? -1 : a > b ? 1 : 0;
const pathKey = (p: CandidateUnit['bestPath']) => JSON.stringify([p.stateIds,p.entityIds,p.edgeIds,p.directions,p.patternId,p.depth]);
/** Validate and annotate the frozen pool. Never reconstruct paths or acquire graph/source data. */
export function describeCandidates(units: readonly CandidateUnit[], graph: RetainedGraph, context: SelectionContext) {
  const states = new Map(graph.states.map(s=>[s.stateId,s]));
  const eligible: PathCandidate[] = [], rejected: {entityId: string; reason: string}[] = [];
  for (const u of [...units].sort((a,b)=>cmp(a.terminalEntity.id,b.terminalEntity.id))) {
    const e = u.terminalEntity;
    let reason = '';
    if (graph.snapshotId!==context.snapshotId || graph.generationId!==context.generationId || u.snapshotId!==context.snapshotId || u.generationId!==context.generationId || e.snapshotId!==context.snapshotId) reason='identity_mismatch';
    else if (!['file','class','function'].includes(e.kind) || !e.path || u.terminalPath!==e.path || !Number.isInteger(e.startLine) || !Number.isInteger(e.endLine) || e.startLine<1 || e.endLine<e.startLine) reason='invalid_source_location';
    else if (!graph.states.some(s=>JSON.stringify(s.entity)===JSON.stringify(e))) reason='terminal_not_in_frozen_states';
    else if (!u.retainedPaths.length || u.retainedPaths.length>2 || !u.retainedPaths.some(p=>pathKey(p)===pathKey(u.bestPath)) || u.depth!==u.bestPath.depth) reason='invalid_retained_paths';
    const sequences: string[][] = [], roots: string[] = [], rootPaths: string[] = [];
    for (const p of u.retainedPaths) {
      const first=states.get(p.stateIds[0]!),last=states.get(p.stateIds.at(-1)!);
      if (!Number.isInteger(p.depth) || p.depth<1 || p.depth>3 || p.stateIds.length!==p.depth+1 || p.entityIds.length!==p.depth+1 || p.edgeIds.length!==p.depth || p.directions.length!==p.depth || !first || !last || first.stepIndex!==0 || first.entity.id!==first.rootEntityId || p.entityIds.at(-1)!==e.id || last.entity.id!==e.id || !last.paths.some(x=>pathKey(x)===pathKey(p))) { reason ||= 'incomplete_or_unretained_path'; continue; }
      const sequence: string[]=[];
      for (let i=0;i<=p.depth;i++) {
        const s=states.get(p.stateIds[i]!);
        if (!s || s.stepIndex!==i || s.patternId!==p.patternId || s.entity.id!==p.entityIds[i] || s.rootEntityId!==first.entity.id || s.entity.snapshotId!==context.snapshotId) {reason ||= 'invalid_path_state';continue;}
        if (!i) continue;
        const link=s.predecessorPaths.find(l=>l.previousStateId===p.stateIds[i-1] && l.stateId===s.stateId && l.edge.id===p.edgeIds[i-1] && l.direction===p.directions[i-1]);
        const edge=link?.edge,up=p.directions[i-1]==='upstream';
        if (!edge || !['upstream','downstream'].includes(p.directions[i-1]!) || edge.snapshotId!==context.snapshotId || !['resolved_scoped','resolved_import_alias'].includes(edge.resolution) || edge.fromId!==p.entityIds[up?i:i-1] || edge.toId!==p.entityIds[up?i-1:i]) reason ||= 'invalid_provenance_edge';
        else sequence.push(edge.relation);
      }
      sequences.push(sequence); roots.push(first.entity.id); rootPaths.push(first.entity.path);
    }
    if (reason) {rejected.push({entityId:e.id,reason});continue;}
    const changed=context.changedPaths.includes(e.path),alreadyVisible=context.visibleRanges.some(r=>r.path===e.path && r.startLine<=e.startLine && r.endLine>=e.endLine),sameRootFile=rootPaths.includes(e.path);
    eligible.push({...u,terminalEntityId:e.id,sourceRange:{startLine:e.startLine,endLine:e.endLine},entityKind:e.kind,
      patternIds:[...new Set(u.retainedPaths.map(p=>p.patternId))].sort(cmp),relationSequences:sequences,
      rootEntityIds:[...new Set(roots)].sort(cmp),rootPaths:[...new Set(rootPaths)].sort(cmp),
      distinctPredecessorCount:Math.min(2,new Set(u.retainedPaths.map(p=>p.entityIds.at(-2))).size),
      pathSupportCount:Math.min(2,new Set(u.retainedPaths.map(p=>JSON.stringify([p.entityIds,p.edgeIds,p.directions,p.patternId]))).size),
      changed,classification:classifyPythonPath(e.path),alreadyVisible,sameRootFile,
      buckets:{depth:u.depth>=2?'multi_hop':'shallow',file:sameRootFile?'root_file':'cross_file',visibility:alreadyVisible?'already_visible':'unseen',change:changed?'changed':'untouched'}});
  }
  return {eligible:eligible.sort((a,b)=>cmp(a.terminalPath,b.terminalPath)||a.sourceRange.startLine-b.sourceRange.startLine||cmp(a.terminalEntityId,b.terminalEntityId)),rejected};
}
