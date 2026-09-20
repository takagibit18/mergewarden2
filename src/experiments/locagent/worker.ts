import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {SnapshotStore} from '../../snapshot/store.ts';
import {SqliteCodeGraph,graphPath} from '../../graph/sqlite-store.ts';
import type {SymbolFact,RelationFact} from '../../graph/contracts.ts';
import {LocAgentRetrieval} from './retrieval.ts';
try{
 const store=await SnapshotStore.load(workerData.stateDir,workerData.snapshotId);
 const {graph,metrics}=await SqliteCodeGraph.open(store);
 try{
  // open() performs the SAME frozen schema/version/digest checks as G0 before any read.
  const db=new DatabaseSync(graphPath(workerData.stateDir,workerData.snapshotId),{readOnly:true});
  try{
   const id=store.manifest.identity.id;
   const symbols=db.prepare('SELECT payload FROM symbols WHERE snapshot_id=? ORDER BY symbol_id').all(id).map(r=>JSON.parse(String(r.payload)) as SymbolFact);
   const relations=db.prepare('SELECT payload FROM relations WHERE snapshot_id=? ORDER BY relation_id').all(id).map(r=>JSON.parse(String(r.payload)) as RelationFact);
   const meta=db.prepare('SELECT warnings FROM graph_snapshots WHERE snapshot_id=?').get(id)!;
   const sources:Record<string,string>={};for(const path of new Set(symbols.map(s=>s.path)))sources[path]=await store.text('head',path);
   const start=performance.now();
   const retrieval=new LocAgentRetrieval({snapshotId:id,symbols,relations,sources,coverage:metrics.coverage,warnings:JSON.parse(String(meta.warnings))},workerData.config);
   const indexMs=performance.now()-start,queryStarted=performance.now();
   const page=workerData.method==='search_entity'?retrieval.search(workerData.input):retrieval.traverse(workerData.input);
   metrics.queryMs=performance.now()-queryStarted;
   parentPort!.postMessage({page,metrics,retrievalIndexMs:indexMs});
  }finally{db.close();}
 }finally{graph.close();}
}catch(error){parentPort!.postMessage({error:error instanceof Error?error.message:'LocAgent retrieval failed'});}
