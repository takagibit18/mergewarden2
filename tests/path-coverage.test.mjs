import test from 'node:test';import assert from 'node:assert/strict';
import {derivePathCoverage,pathCoverageMetrics} from '../src/experiments/locagent/path-coverage.ts';
const candidate=(id,paths,options={})=>({terminalEntityId:id,terminalPath:id+'.py',sourceRange:{startLine:1,endLine:10},depth:Math.max(...paths.map(p=>p.length)),pathSupportCount:paths.length,alreadyVisible:false,changed:false,classification:'production',sameRootFile:false,patternIds:['calls-out'],retainedPaths:paths.map(edges=>({edgeIds:edges,stateIds:['root',...edges.map(e=>'s'+e)],entityIds:['root',...edges.map(e=>'n'+e)],directions:edges.map(()=>'downstream'),patternId:'calls-out',depth:edges.length})),relationSequences:paths.map(p=>p.map(()=>'CALLS')),...options});
const lengths={'calls-out':3},context={snapshotId:'s',generationId:'g',route:'STRUCTURAL_ESCALATION',changedPaths:[],visibleRanges:[]};
test('coverage unions shared edges once and preserves independent root branch signatures',()=>{
 const c=candidate('z',[['a','b','d'],['a','c','d']]),before=JSON.stringify(c),d=derivePathCoverage(c,lengths);assert.deepEqual(d.pathEdgeSet,['a','b','c','d']);assert.equal(d.rootBranchSignatures.length,1);assert.equal(d.patternComplete,true);assert.deepEqual(d.remainingPatternSteps,[0,0]);assert.equal(JSON.stringify(c),before);
 const m=pathCoverageMetrics([d],[d]);assert.equal(m.edgeCoverageRatio,1);assert.equal(m.selectedCoveredEdges,4);
});
test('intermediate and unknown-pattern terminals remain described without inventing terminality',()=>{
 const c=candidate('mid',[['a','b']]);assert.equal(derivePathCoverage(c,lengths).patternComplete,false);const d=derivePathCoverage(c,{});assert.deepEqual(d.remainingPatternSteps,[null]);assert.deepEqual(d.unknownPatterns,['calls-out']);assert.equal(d.patternComplete,false);
});
test('pairwise Jaccard is a diagnostic over edge/state sets including disjoint and empty cases',()=>{
 const a=derivePathCoverage(candidate('a',[['a','b']]),lengths),b=derivePathCoverage(candidate('b',[['b','c']]),lengths),m=pathCoverageMetrics([a,b],[a,b]);assert.equal(m.averageEdgeOverlapJaccard,1/3);assert.equal(m.averageStateOverlapJaccard,0.5);assert.equal(pathCoverageMetrics([],[]).edgeCoverageRatio,0);
});
