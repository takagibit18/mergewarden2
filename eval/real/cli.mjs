import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateSelection,freezeCorpus,verifyBundle} from './admission.mjs';
import {createExperimentLock} from './experiment.mjs';
import {buildBlindAdjudication,scoreOpenLabel,unblindAdjudications} from './open-label.mjs';
import {isolatedState,writeJson} from '../../src/infrastructure/files.ts';
import {RealCorpusAdapter} from './cache.mjs';
import {profileTask} from './profile.mjs';

const [command,...args]=process.argv.slice(2),values={};
for(let i=0;i<args.length;i+=2){if(!args[i].startsWith('--')||!args[i+1]||args[i+1].startsWith('--')||values[args[i]])throw Error('Expected unique --name value arguments');values[args[i]]=args[i+1];}
const get=name=>{if(!values['--'+name])throw Error('Missing --'+name);return values['--'+name];};
const json=async name=>JSON.parse(await readFile(resolve(get(name)),'utf8'));
const rows=async name=>(await readFile(resolve(get(name)),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
const root=fileURLToPath(new URL('../../',import.meta.url));
const outputPath=async(name='output')=>{const target=resolve(get(name));return join(await isolatedState(dirname(target),root),basename(target));};
if(command==='prepare'||command==='profile'){
 const {data}=await verifyBundle(resolve(get('corpus')),{publicOnly:true}),output=await outputPath();
 const state=await isolatedState(resolve(get('state')),root),adapter=new RealCorpusAdapter({cache:resolve(get('cache')),stateDir:state,configuration:{provider:'bigmodel',modelId:'glm-5.3-flash',policy:'final_only',promptVersion:1}});
 const results=[];for(const task of [...data['public/tasks.jsonl'],...data['reserve/tasks.jsonl']]){
  const {store,repositoryPath}=await adapter.materialize(task,{offline:command!=='prepare'});
  results.push(command==='profile'?{caseId:task.case_id,...await profileTask(task,{repositoryPath,stateDir:state})}:{caseId:task.case_id,snapshotId:store.manifest.identity.id,baseSha:task.base_sha,reviewedSha:task.reviewed_sha});
 }
 await writeJson(output,{command,results,modelCalls:0});console.log(JSON.stringify({output,tasks:results.length,modelCalls:0}));
}else if(command==='admit'||command==='freeze'){
 const pool=await rows('pool'),selection=await json('selection'),sources=await json('sources');
 const options={upstreamSources:sources,seenPRs:selection.seenPRs};
 const result=validateSelection(pool,selection.formalIds,selection.reserveIds,options);
 if(command==='freeze'){
  const output=await outputPath();
  console.log(JSON.stringify(await freezeCorpus(output,pool,selection.formalIds,selection.reserveIds,options)));
 }else console.log(JSON.stringify({admitted:true,formal:result.formal.length,reserve:result.reserve.length,approvedPool:pool.length,qualityMeasured:false}));
}else if(command==='verify'){
 const {lock}=await verifyBundle(resolve(get('corpus')));console.log(JSON.stringify({corpusSha256:lock.corpusSha256,status:lock.status}));
}else if(command==='lock'){
 const output=await outputPath();
 console.log(JSON.stringify(await createExperimentLock({corpusDirectory:resolve(get('corpus')),output,kind:get('kind'),timeoutMs:Number(get('timeout-ms')),maxTools:Number(get('max-tools')),maxTokens:Number(values['--max-tokens']??8192),providerReasoningEffort:values['--provider-reasoning-effort']??'provider-default',pilotDirectory:values['--pilot']&&resolve(values['--pilot']),runOutput:resolve(get('run-output'))})));
}else if(command==='score'){
 const runs=(await json('runs')).runs,gold=await rows('gold'),adjudications=await rows('adjudications');
 const output=await outputPath();
 await writeJson(output,scoreOpenLabel({runs,gold,adjudications}));console.log(JSON.stringify({output}));
}else if(command==='blind'){
 const runs=(await json('runs')).runs,gold=await rows('gold'),output=await outputPath(),keyOutput=await outputPath('key-output'),{packet,key}=buildBlindAdjudication({runs,gold});
 await writeJson(output,packet);await writeJson(keyOutput,key);console.log(JSON.stringify({output,keyOutput,entries:packet.entries.length}));
}else if(command==='unblind'){
 const judgments=await json('judgments'),key=await json('key'),output=await outputPath(),receipts=unblindAdjudications({judgments,key});
 await writeFile(output,receipts.map(x=>JSON.stringify(x)).join('\n')+'\n',{flag:'wx'});console.log(JSON.stringify({output,receipts:receipts.length,blindPacketSha256:key.packetSha256}));
}else throw Error('Commands: admit/freeze --pool JSONL --selection JSON --sources JSON [--output DIR]; verify --corpus DIR; lock --corpus DIR --kind reserve|formal --timeout-ms N --max-tools N --output JSON [--pilot DIR]; blind --runs JSON --gold JSONL --output PACKET --key-output PRIVATE_KEY; unblind --judgments JSON --key PRIVATE_KEY --output JSON; score --runs JSON --gold JSONL --adjudications JSONL --output JSON');
