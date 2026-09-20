import {Worker} from 'node:worker_threads';
import {emptyCoverage} from '../../graph/contracts.ts';
import type {GraphMetrics} from '../../graph/sqlite-store.ts';
import type {RetrievalConfig} from './contracts.ts';
import {SEARCH_SCHEMA,TRAVERSE_SCHEMA} from './contracts.ts';
/** Experimental only. A worker is terminated on cancellation, including synchronous BM25/traversal. */
export class LazyLocAgent {
 private stateDir:string;private snapshotId:string;private config:RetrievalConfig;
 metrics={buildMs:0,queryMs:0,retrievalIndexMs:0,warmRequestMs:[] as number[],coldRequestMs:[] as number[],calls:0,coverage:emptyCoverage()};
 constructor(stateDir:string,snapshotId:string,config:RetrievalConfig={}){this.stateDir=stateDir;this.snapshotId=snapshotId;this.config=config;}
 definitions(){return [
  ...(this.config.searchEntityEnabled===false?[]:[{name:'search_entity',description:'Locate HEAD entities by names, qualified IDs, concepts or code terms. Exact matches precede sparse entity/content retrieval and a last fuzzy fallback. Results and exploration previews identify candidates, not behavioral proof. Read source separately for evidence.',schema:SEARCH_SCHEMA}]),
  ...(this.config.traverseEnabled===false?[]:[{name:'traverse_graph',description:'Explore dependency trees from located HEAD entities. upstream=incoming callers/references; downstream=outgoing callees/references. both splits at each root, then keeps each branch direction. Constrain relations, entity types and hops (1..20). Empty filters include all existing types. Read source separately before behavioral claims.',schema:TRAVERSE_SCHEMA}])
 ];}
 async query(method:string,input:Record<string,unknown>,signal?:AbortSignal):Promise<Record<string,unknown>>{
  signal?.throwIfAborted();const started=performance.now();this.metrics.calls++;
  const result=await new Promise<{page?:Record<string,unknown>;metrics?:GraphMetrics;retrievalIndexMs?:number;error?:string}>((resolve,reject)=>{
   const worker=new Worker(new URL('./worker.ts',import.meta.url),{workerData:{stateDir:this.stateDir,snapshotId:this.snapshotId,config:this.config,method,input},execArgv:['--experimental-strip-types'],resourceLimits:{maxOldGenerationSizeMb:512}});
   let settled=false;
   const finish=(action:()=>void)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);void worker.terminate().then(action,action);};
   const cancel=()=>finish(()=>reject(signal?.reason??Error('Retrieval cancelled')));
   signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
   worker.once('message',value=>finish(()=>resolve(value)));
   worker.once('error',()=>finish(()=>resolve({error:'Retrieval worker failed'})));
   worker.once('exit',()=>finish(()=>resolve({error:'Retrieval worker exited before a verified result'})));
  });
  signal?.throwIfAborted();
  if(result.metrics){this.metrics.buildMs+=result.metrics.buildMs;this.metrics.queryMs+=result.metrics.queryMs;this.metrics.retrievalIndexMs+=result.retrievalIndexMs??0;this.metrics.coverage=result.metrics.coverage;(result.metrics.cacheHit?this.metrics.warmRequestMs:this.metrics.coldRequestMs).push(performance.now()-started);}
  return result.page??{status:'error',snapshotId:this.snapshotId,revision:'head',items:[],truncated:false,coverage:emptyCoverage(),warnings:[result.error??'Retrieval failed','Empty results do not establish absence.'],explorationOnly:true};
 }
}
