import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreOpenLabel,digest} from '../eval/real/open-label.mjs';
const gold=[{id:'case',label:'defect',goldenFindings:[{id:'g1'}]}];
const runs=[{runKey:'case/T0/0',caseId:'case',status:'completed',delivered:true,findings:['p1','p2','p3','p4','p5'].map(id=>({id,title:id}))}];
function receipt(i,status,goldenId=null){return {runKey:runs[0].runKey,predictionId:'p'+i,predictionSha256:digest(runs[0].findings[i-1]),goldSha256:digest(gold[0]),status,goldenId,reviewer:{name:'deterministic fixture',kind:'agent'},rationale:'Synthetic scoring contract only',sourceEvidence:'fixture',introductionEvidence:'fixture'};}
test('open-label preserves unknown and reports lower/upper precision bounds',()=>{
 const r=scoreOpenLabel({runs,gold,adjudications:[receipt(1,'matched','g1'),receipt(2,'duplicate','g1'),receipt(3,'new_valid'),receipt(4,'false_positive')]});
 assert.equal(r.referenceFindingRecall,1);assert.equal(r.referencePRRecall,1);assert.equal(r.adjudicatedPrecision,2/3);assert.deepEqual(r.precisionInterval,{lower:.5,upper:.75});assert.equal(r.totals.unadjudicated,1);assert.equal(r.totals.duplicates,1);
});
test('unmatched clean predictions are unadjudicated, never default false positives',()=>{
 const r=scoreOpenLabel({runs,gold:[{id:'case',label:'clean',goldenFindings:[]}]});assert.equal(r.totals.confirmedFP,0);assert.equal(r.adjudicatedPrecision,null);assert.deepEqual(r.precisionInterval,{lower:0,upper:1});
});
test('adjudication is bound to prediction and hidden gold bytes',()=>{
 const a=receipt(1,'matched','g1');assert.throws(()=>scoreOpenLabel({runs,gold,adjudications:[{...a,predictionSha256:'wrong'}]}),/drift/);assert.throws(()=>scoreOpenLabel({runs,gold,adjudications:[{...a,goldSha256:'wrong'}]}),/drift/);
});
test('duplicate reference matches and missing new-valid proof are rejected',()=>{
 assert.throws(()=>scoreOpenLabel({runs,gold,adjudications:[receipt(1,'matched','g1'),receipt(2,'matched','g1')]}),/duplicate/);
 assert.throws(()=>scoreOpenLabel({runs,gold,adjudications:[{...receipt(1,'new_valid'),introductionEvidence:null}]}),/introduction/);
 assert.throws(()=>scoreOpenLabel({runs:[...runs,...runs],gold}),/attempt/);
});
test('semantic duplicates count the reference once, independent of prediction order',()=>{
 const input={runs:[{...runs[0],findings:runs[0].findings.slice(0,2)}],gold,adjudications:[receipt(1,'duplicate','g1'),receipt(2,'matched','g1')]};
 const a=scoreOpenLabel(input),b=scoreOpenLabel({...input,runs:[{...input.runs[0],findings:[...input.runs[0].findings].reverse()}]});
 assert.equal(a.adjudicatedPrecision,1);assert.equal(a.referenceFindingRecall,1);assert.deepEqual(a.totals,b.totals);
 const only=scoreOpenLabel({...input,adjudications:[receipt(1,'duplicate','g1'),receipt(2,'duplicate','g1')]});assert.equal(only.adjudicatedPrecision,1);assert.equal(only.totals.matchedReferenceFindings,1);
});
