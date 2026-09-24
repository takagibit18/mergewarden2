import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createModelRuntime, createPiRuntime } from '../src/runtime.ts';
import { createStructuralRouting, ROUTING_ENTRY, TEXT_TOOLS, STRUCTURAL_TOOLS } from '../src/structural-routing.ts';
import { createReviewExtension } from '../src/extension.ts';
import { ReviewEngine } from '../../../src/engine/review.ts';
import { SnapshotStore } from '../../../src/snapshot/store.ts';
import { SqliteCodeGraph } from '../../../src/graph/sqlite-store.ts';
import { repositoryFixture } from '../../../tests/repository-fixture.mjs';
import { analyzeRetrieval } from '../../../src/experiments/locagent/traces.ts';
import { graphNovelSourceChains } from '../../../eval/structural-routing-funnel.mjs';
const model={provider:'bigmodel',modelId:'glm-5.3-flash'};
const call=(name,args)=>({name,args});
const search=()=>call('search_text',{revision:'head',query:'not_present'});
const source=(path)=>call('read_source',{revision:'head',path,startLine:1,endLine:20});

async function run(t,{initial,changed,path='app.py',steps=[],budget,prepare=true,signal,onRequest,routing='pi_structural_v1',maxTools=40}) {
 const f=await repositoryFixture(t,initial); await f.write(path,changed); const head=await f.commit();
 const store=await SnapshotStore.freeze({repositoryPath:f.repository,stateDir:f.state,input:{kind:'commits',base:f.base,head},configuration:{...model,policy:'final_only',promptVersion:1}});
 if(prepare){const opened=await SqliteCodeGraph.open(store);opened.graph.close();}
 const requests=[]; const prior=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{
  const body=await new Request(url,init).json();requests.push(body);onRequest?.(requests.length,body);
  const step=steps[requests.length-1];const action=typeof step==='function'?step(body):step;
  const delta=action?{role:'assistant',tool_calls:[{index:0,id:'route_call_'+requests.length,type:'function',function:{name:action.name,arguments:JSON.stringify(action.args)}}]}:{role:'assistant',content:'Done.'};
  return new Response(`data: ${JSON.stringify({id:'offline',object:'chat.completion.chunk',created:1,model:model.modelId,choices:[{index:0,delta,finish_reason:action?'tool_calls':'stop'}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}})}\n\ndata: [DONE]\n\n`,{headers:{'Content-Type':'text/event-stream'}});
 };
 t.after(()=>{globalThis.fetch=prior;});
 const catalog=await createModelRuntime(model.provider,'offline-key');
 const result=await new ReviewEngine(options=>createPiRuntime(options,catalog)).run({repositoryPath:f.repository,stateDir:f.state,input:{kind:'commits',base:f.base,head},model,signal,maxToolCalls:maxTools,evaluation:{tools:'text+locagent',graphMode:'prepared_only',routing,routingBudget:budget}});
 const manifest=JSON.parse(await readFile(join(f.state,'runs',result.runId,'run.json'),'utf8'));
 const rows=(await readFile(join(f.state,'runs',result.runId,'session.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.equal(manifest.metrics.graph.buildMs,0);assert.equal(manifest.metrics.graph.extractedFiles,0);assert.equal(manifest.metrics.graph.resolvedFiles,0);
 return {result,manifest,rows,requests};
}
const diff=(path='app.py')=>call('read_diff',{path});
const submit=(path='app.py')=>call('submit_review',{summary:'Offline structural routing fixture.',reviewedPaths:[path],findings:[]});
const signature={initial:{'app.py':'def foo(a):\n    return a\n','caller.py':'from app import foo\ndef caller():\n    return foo(1)\n'},changed:'def foo(a,b):\n    return a+b\n'};
const entity=()=>call('search_entity',{searchTerms:['foo'],topK:1});
const traverse=body=>{
 const results=body.messages.filter(m=>m.role==='tool').map(m=>{try{return JSON.parse(m.content);}catch{return null;}}).filter(Boolean);
 const root=results.findLast(r=>r.items?.some(i=>i.name==='foo'))?.items.find(i=>i.name==='foo').entityId;
 assert.ok(root);return call('traverse_graph',{startEntities:[root],direction:'upstream',maxHops:1,entityTypeFilter:['function'],relationTypeFilter:['CALLS'],maxNodes:10});
};
test('P1: real HTTP payload defers G1, adds tools on next request, verifies novel caller, emits one native hint',async t=>{
 const r=await run(t,{...signature,steps:[diff(),diff(),entity(),traverse,source('caller.py'),submit()]});
 assert.equal(r.result.report.status,'completed');
 assert.deepEqual(r.requests[0].tools.map(t=>t.function.name).sort(),[...TEXT_TOOLS].sort());
 for(const name of STRUCTURAL_TOOLS) assert.ok(r.requests[1].tools.some(t=>t.function.name===name));
 assert.doesNotMatch(r.requests[0].messages[0].content,/Structural repository navigation is available|G1 structural navigation/);
 const hints=r.rows.filter(r=>r.type==='message'&&r.message.role==='toolResult').flatMap(r=>r.message.content).filter(c=>c.text?.includes('[Structural investigation recommended]'));
 assert.equal(hints.length,1);assert.match(hints[0].text,/incoming CALLS/);
 assert.equal(r.manifest.metrics.routing.triggered,1);assert.equal(r.manifest.metrics.routing.verified,1);
 assert.ok(r.rows.some(r=>r.customType===ROUTING_ENTRY&&r.data.state==='VERIFIED'));
 const trace=analyzeRetrieval({runKey:'P1',snapshotId:r.manifest.snapshotId,findings:[],jsonl:r.rows.map(JSON.stringify).join('\n')});
 assert.deepEqual(trace.traceIssues,[]);assert.equal(trace.metrics.novelEntityToSource,1);assert.equal(trace.metrics.graphAssistedFindings,0);
 assert.equal(graphNovelSourceChains(trace,r.manifest.snapshotId,['app.py']).length,1);
});
test('P2: inheritance trigger through real Pi',async t=>{
 const r=await run(t,{initial:{'app.py':'class A: pass\nclass B: pass\nclass Child(A): pass\n'},changed:'class A: pass\nclass B: pass\nclass Child(B): pass\n',steps:[diff(),submit()]});
 assert.equal(r.result.report.status,'completed');assert.equal(r.manifest.metrics.routing.reasons.base_list_change,1);
});
test('P3: explicit re-export trigger through real Pi',async t=>{
 const r=await run(t,{path:'pkg/__init__.py',initial:{'pkg/__init__.py':'from .a import A\n','pkg/a.py':'class A: pass\nclass B: pass\n'},changed:'from .a import B\n',steps:[diff('pkg/__init__.py'),submit('pkg/__init__.py')]});
 assert.equal(r.result.report.status,'completed');assert.equal(r.manifest.metrics.routing.reasons.explicit_export_change,1);
});
const local={initial:{'app.py':'value = 1 + 1\n','other.py':'value = 5\n'},changed:'value = 1 + 2\n'};
test('P4: three unresolved text searches escalate',async t=>{
 const r=await run(t,{...local,steps:[diff(),search(),search(),search(),submit()]});
 assert.equal(r.manifest.metrics.routing.firstActivationToolOrdinal,4);assert.equal(r.manifest.metrics.routing.reasons.search_pressure,1);
});
test('N1: local arithmetic stays text-only',async t=>{
 const r=await run(t,{...local,steps:[diff(),source('app.py'),submit()]});
 assert.equal(r.result.report.status,'completed');assert.equal(r.manifest.metrics.routing.triggered,0);
 assert.ok(r.requests.every(b=>b.tools.length===4));
});
test('N2: search followed by untouched source suppresses mechanical escalation',async t=>{
 const r=await run(t,{...local,steps:[diff(),call('search_text',{revision:'head',query:'value'}),source('other.py'),search(),search(),search(),submit()]});
 assert.equal(r.result.report.status,'completed');assert.equal(r.manifest.metrics.routing.activated,0);assert.equal(r.manifest.metrics.routing.reasons.text_verified,1);
 assert.ok(r.requests.every(b=>b.tools.length===4));
});
test('structural budget blocks third call, engine counts rejection, text and submit remain usable',async t=>{
 const r=await run(t,{...signature,budget:{maxStructuralCallsPerEpisode:2},steps:[diff(),entity(),entity(),entity(),search(),source('app.py'),submit()]});
 assert.equal(r.result.report.status,'completed');assert.equal(r.manifest.metrics.graphToolCalls,2);
 assert.equal(r.manifest.metrics.toolRequests,7);assert.equal(r.manifest.metrics.toolRejected,1);assert.equal(r.manifest.metrics.toolExecuted,6);
 assert.ok(r.rows.some(r=>r.message?.role==='toolResult'&&r.message.isError&&JSON.stringify(r).includes('Structural investigation budget reached')));
});
test('prepared-only missing graph degrades once and review still completes',async t=>{
 const r=await run(t,{...signature,prepare:false,steps:[diff(),entity(),entity(),search(),submit()]});
 assert.equal(r.result.report.status,'completed');assert.equal(r.manifest.metrics.routing.degraded,1);assert.equal(r.manifest.metrics.graphToolCalls,1);
});
test('routing rejections consume the outer budget and cannot keep a review alive indefinitely',async t=>{
 const r=await run(t,{...signature,maxTools:4,budget:{maxStructuralCallsPerEpisode:1},steps:[diff(),entity(),entity(),entity(),submit()]});
 assert.equal(r.result.report.status,'partial');assert.match(r.result.report.summary,/tool budget exhausted/);
 assert.equal(r.manifest.metrics.graphToolCalls,1);assert.equal(r.manifest.metrics.toolRequests,5);assert.equal(r.manifest.metrics.toolRejected,3);
});
test('active routing cancellation stops new tools and bounded Pi/worker cleanup',async t=>{
 const abort=new AbortController();const started=Date.now();
 const r=await run(t,{...signature,signal:abort.signal,onRequest:n=>{if(n===3)abort.abort();},steps:[diff(),entity(),entity(),submit()]});
 assert.equal(r.result.report.status,'cancelled');assert.ok(Date.now()-started<15000);assert.ok(r.manifest.metrics.graphToolCalls<=1);
});
test('routing none preserves current G1 payload and navigation prompt',async t=>{
 const r=await run(t,{...local,routing:'none',steps:[diff(),submit()]});
 assert.equal(r.manifest.metrics.routing,undefined);assert.equal(r.requests[0].tools.length,6);
 assert.match(r.requests[0].messages[0].content,/Structural repository navigation is available/);
});

function hooks(snapshotId='s',entries=[],allowed=new Set([...TEXT_TOOLS,...STRUCTURAL_TOOLS])){
 const handlers={};let active=[...allowed];const saved=[];let blocked=0;
 const routing=createStructuralRouting({snapshotId,changedPaths:['app.py'],onBlockedCall:()=>blocked++},allowed);
 const pi={on:(name,fn)=>handlers[name]=fn,appendEntry:(customType,data)=>saved.push({type:'custom',customType,data:structuredClone(data)}),getActiveTools:()=>active,setActiveTools:names=>active=names,getAllTools:()=>[...allowed].map(name=>({name}))};
 routing.extension(pi);handlers.session_start({}, {sessionManager:{getBranch:()=>entries}});
 const result=(name,details,input={})=>{handlers.tool_call({toolName:name,input});return handlers.tool_result({toolName:name,details:{snapshotId,status:'ok',...details},input,content:[]});};
 return {handlers,result,saved,routing,active:()=>active,blocked:()=>blocked,pi};
}
test('pagination caches offsets, does not mistake partial signature for removal, and restores same-snapshot state without hints',()=>{
 const h=hooks();h.result('read_diff',{path:'app.py',offset:0,totalLines:2,lines:['-def foo(a):']});assert.equal(h.routing.metrics().triggered,0);
 h.result('read_diff',{path:'app.py',offset:1,totalLines:2,lines:['+def foo(a,b):']});
 h.result('read_diff',{path:'app.py',offset:0,totalLines:2,lines:['-def foo(a):','+def foo(a,b):']});assert.equal(h.routing.metrics().triggered,1);
 const restored=hooks('s',h.saved);assert.equal(restored.routing.metrics().activated,1);assert.equal(restored.active().length,6);
 assert.equal(restored.result('read_diff',{path:'app.py',offset:0,totalLines:2,lines:['-def foo(a):','+def foo(a,b):']}),undefined);
 assert.equal(hooks('other',h.saved).active().length,4);
});
test('unknown active tool stays blocked by independent safety hook',async()=>{
 const h=hooks();let guard;createReviewExtension(new Set(TEXT_TOOLS))({on:(_n,fn)=>guard=fn});h.pi.setActiveTools(['unknown_tool']);
 assert.equal((await guard({toolName:'unknown_tool'})).block,true);
});
test('identifier truncated or eight-path result escalates; failed/base reads never verify a route',()=>{
 for(const details of [{truncated:true,items:[]},{items:Array.from({length:8},(_,i)=>({path:`p${i}.py`}))}]){
  const h=hooks();h.result('search_text',{revision:'head',...details},{query:'foo'});assert.equal(h.routing.metrics().activated,1);
 }
 const h=hooks();h.result('read_diff',{path:'app.py',offset:0,totalLines:2,lines:['-def foo(a):','+def foo(a,b):']});
 h.result('search_entity',{revision:'head',items:[{entityId:'x',path:'caller.py',startLine:5,endLine:8}]});
 h.result('read_source',{revision:'base',path:'caller.py',startLine:5,endLine:8});assert.equal(h.routing.metrics().verified,0);
 h.result('read_source',{revision:'head',path:'caller.py',startLine:1,endLine:2});assert.equal(h.routing.metrics().verified,0);
 h.result('read_source',{revision:'head',path:'caller.py',startLine:5,endLine:8});assert.equal(h.routing.metrics().verified,1);
 const restored=hooks('s',h.saved);assert.equal(restored.routing.metrics().verified,1);assert.equal(restored.active().length,6);
});
test('relevant text resolution suppresses high-confidence cue; unavailable tools never activate',()=>{
 const h=hooks();h.result('search_text',{revision:'head',items:[{path:'caller.py'}]},{query:'foo'});h.result('read_source',{revision:'head',path:'caller.py',startLine:1,endLine:3});
 h.result('read_diff',{path:'app.py',offset:0,totalLines:2,lines:['-def foo(a):','+def foo(a,b):']});assert.equal(h.routing.metrics().reasons.text_verified,1);assert.equal(h.active().length,4);
 const unavailable=hooks('s',[],new Set(TEXT_TOOLS));unavailable.result('read_diff',{path:'app.py',offset:0,totalLines:2,lines:['-def foo(a):','+def foo(a,b):']});assert.equal(unavailable.routing.metrics().reasons.structural_tools_unavailable,1);
});
test('repository query identifiers cannot collide with object prototype keys',()=>{
 const h=hooks();for(const query of ['constructor','__proto__','toString'])h.result('search_text',{revision:'head',items:[]},{query});
 assert.equal(h.routing.metrics().activated,1);
});
test('two episodes share six-call total budget across restore, then suppress distinct third cue',()=>{
 const h=hooks();
 const cue=(h,name)=>h.result('read_diff',{path:'app.py',offset:0,totalLines:2,lines:[`-def ${name}(a):`,`+def ${name}(a,b):`]});
 cue(h,'foo');for(let i=0;i<4;i++)h.result('search_entity',{revision:'head',items:[]});
 assert.equal(h.handlers.tool_call({toolName:'search_entity'}).block,true);
 const restored=hooks('s',h.saved);cue(restored,'bar');for(let i=0;i<2;i++)restored.result('search_entity',{revision:'head',items:[]});
 assert.equal(restored.handlers.tool_call({toolName:'search_entity'}).block,true);
 cue(restored,'baz');assert.equal(restored.routing.metrics().activated,2);assert.equal(restored.routing.metrics().structuralAttempts,6);assert.equal(restored.routing.metrics().suppressed,3);
});
