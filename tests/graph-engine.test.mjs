import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ReviewEngine } from '../src/engine/review.ts';
import { MemoryJournal } from '../src/adapters/memory-journal.ts';
import { repositoryFixture } from './repository-fixture.mjs';
import { sha256 } from '../src/infrastructure/files.ts';
const runtime=script=>async options=>({journal:new MemoryJournal(),async prompt(_text,signal){await script(Object.fromEntries(options.tools.map(t=>[t.name,t.execute])),signal);},async abort(){},dispose(){},usage(){return {input:0,output:0,total:0};}});
async function setup(t){const f=await repositoryFixture(t);const head=await f.change();return {...f,options:{repositoryPath:f.repository,stateDir:f.state,input:{kind:'commits',base:f.base,head},model:{provider:'fixture',modelId:'offline'}}};}
test('graph build failure cannot turn into a completed clean report',async t=>{
 const f=await setup(t);await writeFile(join(f.state,'graphs'),'block index creation');const r=await new ReviewEngine(runtime(async tools=>{const page=await tools.graph_lookup({query:'ratio',limit:10});assert.equal(page.status,'error');await tools.read_diff({path:'app.py'});await tools.submit_review({summary:'no findings',reviewedPaths:['app.py'],findings:[]});})).run(f.options);assert.equal(r.report.status,'partial');assert.match(r.report.summary,/graph.*failed/);
});
test('graph id and even a computed source hash cannot bypass read_source evidence',async t=>{
 const f=await setup(t);const r=await new ReviewEngine(runtime(async tools=>{const diff=await tools.read_diff({path:'app.py'});const candidate={id:'x',title:'x',claim:'x',trigger:'x',impact:'x',severity:'high',evidence:[{snapshotId:diff.snapshotId,revision:'head',path:'app.py',startLine:1,endLine:2,contentSha256:sha256('def ratio(total, count):\n    return total / count')}]};await assert.rejects(tools.submit_review({summary:'x',reviewedPaths:['app.py'],findings:[candidate]}),/read_source/);candidate.evidence=[{snapshotId:diff.snapshotId,nodeId:'graph-node'}];await assert.rejects(tools.submit_review({summary:'x',reviewedPaths:['app.py'],findings:[candidate]}),/revision/);await tools.submit_review({summary:'offline',reviewedPaths:['app.py'],findings:[]});})).run(f.options);assert.equal(r.report.status,'completed');
});
test('graph cancellation terminates worker and delivers cancelled rather than clean',async t=>{
 const f=await setup(t);const abort=new AbortController();const r=await new ReviewEngine(runtime(async tools=>{const request=tools.graph_lookup({query:'ratio',limit:10});setTimeout(()=>abort.abort(),10);await assert.rejects(request);})).run({...f.options,signal:abort.signal});assert.equal(r.report.status,'cancelled');
});
