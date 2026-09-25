import test from 'node:test';
import assert from 'node:assert/strict';
import {describeCandidates} from '../src/experiments/locagent/candidate-set.ts';
import {candidateUnits} from '../src/experiments/locagent/path-candidates.ts';
import {retainStructuralPaths,explanationStateId} from '../src/experiments/locagent/path-retention.ts';
const context={snapshotId:'s',generationId:'g',route:'STRUCTURAL_ESCALATION',changedPaths:['root.py'],visibleRanges:[{path:'leaf.py',startLine:1,endLine:2}]};
function fixture(){
 const states=[['root',0],['left',1],['right',1],['leaf',2]].map(([name,stepIndex])=>({entity:{id:name,snapshotId:'s',path:name+'.py',name,qualifiedName:name,kind:'function',startLine:1,endLine:9},rootEntityId:'root',patternId:'calls-out',stepIndex,direction:'downstream'}));
 const links=[[0,1],[0,2],[1,3],[2,3]].map(([a,b],i)=>({previousStateId:explanationStateId(states[a]),stateId:explanationStateId(states[b]),direction:'downstream',edge:{id:'edge'+i,snapshotId:'s',fromId:states[a].entity.id,toId:states[b].entity.id,relation:'CALLS',resolution:'resolved_scoped'}}));
 const graph=retainStructuralPaths({snapshotId:'s',generationId:'g',states,links});return {graph,units:candidateUnits(graph)};
}
test('candidate descriptions preserve frozen diamond paths and distinguish partial source visibility',()=>{
 const {graph,units}=fixture(),before=JSON.stringify({graph,units}),r=describeCandidates(units,graph,context),leaf=r.eligible.find(x=>x.terminalEntityId==='leaf');
 assert.equal(r.rejected.length,0);assert.equal(leaf.pathSupportCount,2);assert.equal(leaf.distinctPredecessorCount,2);assert.equal(leaf.alreadyVisible,false);assert.equal(leaf.buckets.depth,'multi_hop');assert.deepEqual(leaf.relationSequences,[['CALLS','CALLS'],['CALLS','CALLS']]);assert.equal(JSON.stringify({graph,units}),before);
 assert.deepEqual(r,describeCandidates([...units].reverse(),graph,context));
});
test('candidate eligibility rejects foreign identities, malformed locations and unretained provenance',()=>{
 const {graph,units}=fixture();
 for(const mutate of [u=>u.generationId='foreign',u=>u.terminalEntity.endLine=NaN,u=>u.retainedPaths[0].edgeIds[0]='invented',u=>u.bestPath.depth=0]){
  const changed=structuredClone(units);mutate(changed[0]);const r=describeCandidates(changed,graph,context);assert.ok(r.rejected.length);assert.ok(!r.eligible.some(x=>x.terminalEntityId===changed[0].terminalEntity.id));
 }
 const bad=structuredClone(graph);for(const s of bad.states)for(const l of s.predecessorPaths)l.edge.resolution='candidate';assert.equal(describeCandidates(units,bad,context).eligible.length,0);
});
