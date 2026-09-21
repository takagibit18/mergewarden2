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
  ...(this.config.searchEntityEnabled===false?[]:[{name:'search_entity',description:'Locate candidate HEAD entities when the exact graph symbol is not already known, especially when a review question may depend on untouched repository code. Supports exact names or IDs, sparse entity and content retrieval, and a final fuzzy fallback. Use results to choose focused structural exploration; candidates and previews are not behavioral proof. Verify relevant code with read_source.',schema:SEARCH_SCHEMA}]),
  ...(this.config.traverseEnabled===false?[]:[{name:'traverse_graph',description:'Explore bounded structural dependency paths from located entities. upstream follows incoming callers or references and can discover untouched code that depends on a changed symbol; downstream follows outgoing dependencies. both splits at each root, then keeps each branch direction. Use focused roots, relation filters, and small hop counts first to discover unseen related code. Hops are bounded to 1..20 and empty filters include all existing types. Verify relevant results with read_source.',schema:TRAVERSE_SCHEMA}])
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
