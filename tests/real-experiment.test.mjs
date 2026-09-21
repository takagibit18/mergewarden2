import test from 'node:test';
import assert from 'node:assert/strict';
import {effectivePrompt,validateRuntime,pilotStatistics,validatePilot} from '../eval/real/experiment.mjs';
import {digest} from '../eval/real/open-label.mjs';
import {planBatch} from '../eval/real/batch.mjs';
const identity={kind:'reserve',provider:'bigmodel',model:'glm-5.3-flash',corpusSha256:'corpus',outputDirectory:'/isolated/run',maxTokens:8192,thinkingLevel:'medium',modelApi:'openai-completions',modelBaseUrl:'https://open.bigmodel.cn/api/paas/v4/',timeoutMs:300000,maxTools:100};
const runtime=arm=>({systemPrompt:effectivePrompt(arm,identity.outputDirectory),modelMaxTokens:8192,thinkingLevel:'medium',modelApi:identity.modelApi,modelBaseUrl:identity.modelBaseUrl});
test('effective prompt guard checks the complete Pi cwd suffix and model configuration',()=>{
 validateRuntime(runtime('T0'),identity,'T0');
 for(const change of [{systemPrompt:runtime('T0').systemPrompt+'\nHidden gold'}, {modelMaxTokens:4096},{thinkingLevel:'off'},{modelBaseUrl:'https://other.invalid'}])assert.throws(()=>validateRuntime({...runtime('T0'),...change},identity,'T0'),/drift/);
 assert.throws(()=>validateRuntime(runtime('G0'),identity,'T0'),/drift/);
});
test('reserve statistics preserve timeout/partial outcomes and measure no quality',()=>{
 const s=pilotStatistics([{elapsedMs:10,status:'completed',delivered:true,manifest:{metrics:{toolCalls:3},usage:{input:10,output:2}}},{elapsedMs:300,status:'partial',delivered:true,report:{summary:'Review time budget exhausted'}}]);assert.equal(s.completionRate,.5);assert.equal(s.timeouts,1);assert.equal(s.timeoutRate,.5);assert.equal(s.qualityMeasured,false);
});
test('formal pilot admission requires six disjoint reserve tasks and all arms on identical snapshots',()=>{
 const tasks=Array.from({length:6},(_,i)=>({case_id:'reserve-'+i,repository:'o/r',repository_url:'https://github.com/o/r.git',base_sha:'a'.repeat(40),reviewed_sha:'b'.repeat(40),language:'Python'})),plan=planBatch(tasks,{});
 const batch={identity,identitySha256:digest(identity),plan,planSha256:digest(plan)},lock={corpusSha256:'corpus',reserveIds:tasks.map(t=>t.case_id)};
 const runs=plan.map(j=>({...j,caseId:j.task.case_id,identitySha256:batch.identitySha256,snapshotId:j.task.case_id,status:'completed',delivered:true,manifest:{status:'delivered',snapshotId:j.task.case_id,model:{provider:identity.provider,modelId:identity.model},limits:{timeoutMs:identity.timeoutMs,maxToolCalls:identity.maxTools},runtimeConfiguration:runtime(j.arm)},report:{snapshot:{id:j.task.case_id}}}));
 validatePilot({runs,identitySha256:batch.identitySha256},batch,lock);
 assert.throws(()=>validatePilot({runs:runs.slice(1),identitySha256:batch.identitySha256},batch,lock),/incomplete/);
 const drift=structuredClone(runs);drift[1].snapshotId='other';assert.throws(()=>validatePilot({runs:drift,identitySha256:batch.identitySha256},batch,lock),/identity/);
 assert.throws(()=>validatePilot({runs,identitySha256:batch.identitySha256},batch,{...lock,reserveIds:lock.reserveIds.slice(1)}),/reserve tasks/);
});
