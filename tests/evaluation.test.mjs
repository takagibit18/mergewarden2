import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { score } from '../src/eval/metrics.ts';
import { validateCorpus } from '../eval/validate.mjs';
const bytes=await readFile(new URL('../eval/cases.json',import.meta.url),'utf8');const corpus=JSON.parse(bytes);const lock=JSON.parse(await readFile(new URL('../eval/corpus.lock.json',import.meta.url),'utf8'));
test('frozen corpus contains 12 defects and eight hard negatives with immutable identities',()=>{assert.equal(validateCorpus(corpus,lock,bytes).cases.length,20);assert.throws(()=>validateCorpus(corpus,lock,bytes+' '),/hash mismatch/);});
test('quality counts explicit one-to-one semantic matches, failures and false positives',()=>{
 const gold=corpus.cases.find(c=>c.id==='cross-key');const clean=corpus.cases.find(c=>c.id==='clean-guard');
 const runs=[{runKey:'a',caseId:gold.id,arm:'text+graph',delivered:true,status:'completed',findings:[{id:'good'},{id:'bad'}],elapsedMs:10},{runKey:'b',caseId:clean.id,arm:'text+graph',delivered:true,status:'completed',findings:[{id:'noise'}],elapsedMs:10},{runKey:'c',caseId:gold.id,arm:'text+graph',delivered:false,status:'failed',findings:[],elapsedMs:10}];
 const mapping=[{runKey:'a',status:'complete',reviewer:'fixture',predictions:[{predictionId:'good',goldenId:gold.expectedFindings[0].id,rationale:'same behavior'},{predictionId:'bad',goldenId:null,rationale:'different behavior'}]},{runKey:'b',status:'complete',reviewer:'fixture',predictions:[{predictionId:'noise',goldenId:null,rationale:'guard protects it'}]}];
 const r=score(corpus.cases,runs,mapping);const q=r.byArm['text+graph'].quality;assert.equal(q.findingPrecision,1/3);assert.equal(q.findingRecall,1/2);assert.equal(q.f1,2/5);assert.equal(q.cleanPrFalsePositiveRate,1);assert.equal(q.prLevelRecall,1/2);assert.equal(q.crossFileRecall,1/2);assert.equal(q.completeDeliveryRate,2/3);assert.equal(r.byArm['text+graph'].cost.totalTokens,null);assert.equal(r.perCase.length,3);
 mapping[0].predictions[1].goldenId=gold.expectedFindings[0].id;assert.throws(()=>score(corpus.cases,runs,mapping),/duplicate golden/);
});
test('location overlap never silently counts as semantic success',()=>{const c=corpus.cases[0];assert.throws(()=>score(corpus.cases,[{runKey:'a',caseId:c.id,arm:'text-only',findings:[{id:'p',evidence:[c.relevantLocation]}]}],[]),/pending/);});
