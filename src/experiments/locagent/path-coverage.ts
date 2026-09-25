import type {PathCandidate,SelectionContext} from './candidate-set.ts';
import {CANDIDATE_SLOTS,selectCandidateSet} from './candidate-set.ts';

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const union=(values:readonly (readonly string[])[])=>[...new Set(values.flat())].sort(cmp);
export interface CandidateCoverage {
  candidate:PathCandidate;
  pathEdgeSet:string[]; pathStateSet:string[]; pathEntitySet:string[];
  rootBranchSignatures:string[];
  remainingPatternSteps:(number|null)[];
  patternComplete:boolean;
  unknownPatterns:string[];
}
/** Mechanical descriptors over frozen complete paths; no eligibility or provenance changes. */
export function derivePathCoverage(candidate:PathCandidate,patternLengths:Readonly<Record<string,number>>):CandidateCoverage {
  if(candidate.retainedPaths.length<1||candidate.retainedPaths.length>2)throw Error('Expected frozen bounded retained paths');
  const remaining=candidate.retainedPaths.map(p=>{
    const length=patternLengths[p.patternId];
    if(length===undefined)return null;
    if(!Number.isInteger(length)||length<p.depth)throw Error('Invalid frozen pattern length');
    return length-p.depth;
  });
  const branches=candidate.retainedPaths.map((p,i)=>{
    const relation=candidate.relationSequences[i]?.[0],child=p.entityIds[1],direction=p.directions[0];
    if(!relation||!child||!direction||!p.edgeIds.length)throw Error('Incomplete frozen path');
    return JSON.stringify([p.patternId,relation,direction,child]);
  });
  return {candidate,pathEdgeSet:union(candidate.retainedPaths.map(p=>p.edgeIds)),pathStateSet:union(candidate.retainedPaths.map(p=>p.stateIds)),pathEntitySet:union(candidate.retainedPaths.map(p=>p.entityIds)),rootBranchSignatures:union([branches]),remainingPatternSteps:remaining,patternComplete:remaining.some(n=>n===0),unknownPatterns:union([candidate.retainedPaths.filter((_,i)=>remaining[i]===null).map(p=>p.patternId)])};
}
const jaccard=(a:readonly string[],b:readonly string[])=>{const merged=new Set([...a,...b]);return merged.size?a.filter(x=>b.includes(x)).length/merged.size:0;};
export function pathCoverageMetrics(pool:readonly CandidateCoverage[],selected:readonly CandidateCoverage[]){
  const allEdges=union(pool.map(c=>c.pathEdgeSet)),edges=union(selected.map(c=>c.pathEdgeSet)),allBranches=union(pool.map(c=>c.rootBranchSignatures)),branches=union(selected.map(c=>c.rootBranchSignatures)),patterns=union(selected.map(c=>c.candidate.patternIds));
  const overlap=[];
  for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++){
    const a=selected[i]!,b=selected[j]!;overlap.push({first:a.candidate.terminalEntityId,second:b.candidate.terminalEntityId,edgeOverlapJaccard:jaccard(a.pathEdgeSet,b.pathEdgeSet),stateOverlapJaccard:jaccard(a.pathStateSet,b.pathStateSet)});
  }
  return {eligibleStructuralEdges:allEdges.length,selectedCoveredEdges:edges.length,edgeCoverageRatio:allEdges.length?edges.length/allEdges.length:0,eligibleRootBranches:allBranches.length,selectedRootBranches:branches.length,rootBranchCoverageRatio:allBranches.length?branches.length/allBranches.length:0,eligiblePatterns:union(pool.map(c=>c.candidate.patternIds)),selectedPatterns:patterns,selectedPatternCount:patterns.length,coveredEdgeIds:edges,coveredRootBranches:branches,overlap,averageEdgeOverlapJaccard:overlap.length?overlap.reduce((n,p)=>n+p.edgeOverlapJaccard,0)/overlap.length:0,averageStateOverlapJaccard:overlap.length?overlap.reduce((n,p)=>n+p.stateOverlapJaccard,0)/overlap.length:0,pathEdgeAtoms:allEdges.length,pathStateAtoms:union(pool.map(c=>c.pathStateSet)).length,pathEntityAtoms:union(pool.map(c=>c.pathEntitySet)).length,rootBranchAtoms:allBranches.length};
}
