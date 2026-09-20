import {decodePiTrace, analyzeTrace, type ToolCall} from '../../eval/traces.ts';
import type {FindingCandidate} from '../../domain/contracts.ts';
type Row=Record<string,any>;
const rows=(v:unknown):Row[]=>Array.isArray(v)?v.filter(x=>x&&typeof x==='object'):[];
const end=(c:ToolCall)=>c.resultEvent??Infinity;
const canonical=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort()):x);
/** Offline observation of native model-visible events. No model self-attribution. */
export function analyzeRetrieval(input:{runKey:string;snapshotId:string;findings:FindingCandidate[];jsonl:string}){
 const trace=decodePiTrace(input.jsonl),calls=trace.calls;
 const ok=(c:ToolCall)=>!c.isError&&c.response?.snapshotId===input.snapshotId&&['ok','parse_incomplete'].includes(String(c.response.status));
 for(const c of calls)if(c.response?.snapshotId!==undefined&&c.response.snapshotId!==input.snapshotId)trace.issues.push('Cross-snapshot result: '+c.id);
 const search=calls.filter(c=>['search_entity','graph_lookup'].includes(c.name));
 const traversal=calls.filter(c=>['traverse_graph','graph_neighbors'].includes(c.name));
 const graphs=[...search,...traversal].sort((a,b)=>a.ordinal-b.ordinal);
 const exposed=(c:ToolCall,path:string)=>ok(c)&&(['read_diff','read_source'].includes(c.name)?c.response?.path===path:['search_text','search_entity','graph_lookup'].includes(c.name)?rows(c.response?.items).some(i=>i.path===path):false);
 const locations=(c:ToolCall):Row[]=>!ok(c)?[]:c.name==='traverse_graph'?rows(c.response?.items).filter(i=>i.depth>0).map(i=>({...i,id:i.entityId,via:i.discoveredVia})):rows(c.response?.items).filter(e=>c.args.direction==='incoming').map(e=>({id:e.fromId,path:e.sourcePath,startLine:e.sourceLine,endLine:e.sourceEndLine,via:{edgeId:e.id,relation:e.relation,resolution:e.resolution,direction:'upstream',pathResolved:['resolved_scoped','resolved_import_alias'].includes(e.resolution)}}));
 const searchLinks:Row[]=[],discoveries:Row[]=[],sourceLinks:Row[]=[];
 for(const c of traversal){
  const roots=c.name==='traverse_graph'?c.args.startEntities:[c.args.symbolId];
  const prior=search.findLast(s=>ok(s)&&end(s)<c.callEvent&&rows(s.response?.items).some(i=>Array.isArray(roots)&&roots.some(r=>[i.entityId,i.entityName,i.qualifiedName,i.id].includes(r))));
  if(prior)searchLinks.push({searchCallId:prior.id,traverseCallId:c.id});
  for(const loc of locations(c)){
   const earlier=calls.filter(p=>end(p)<end(c));
   const novelPath=!earlier.some(p=>exposed(p,loc.path)||locations(p).some(i=>i.path===loc.path));
   const novelEntity=!earlier.some(p=>ok(p)&&(rows(p.response?.items).some(i=>[i.entityId,i.id].includes(loc.id))||locations(p).some(i=>i.id===loc.id)))&&!earlier.some(p=>['read_diff','read_source','search_text'].includes(p.name)&&exposed(p,loc.path));
   const discovery={traverseCallId:c.id,entityId:loc.id,path:loc.path,novelPath,novelEntity,location:loc};discoveries.push(discovery);
   const source=calls.find(s=>s.name==='read_source'&&ok(s)&&s.callEvent>end(c)&&s.response?.revision==='head'&&s.response.path===loc.path&&Number(s.response.startLine)<=loc.startLine&&Number(s.response.endLine)>=loc.endLine);
   if(source){
    const competitors=calls.filter(p=>p.id!==source.id&&p.id!==c.id&&end(p)<source.callEvent&&exposed(p,loc.path));
    sourceLinks.push({...discovery,sourceCallId:source.id,competingExposureCallIds:competitors.map(p=>p.id),retrievalOrigin:c.name==='traverse_graph'?'locagent_graph':'current_graph',strictNovel:novelPath&&novelEntity&&!competitors.length});
   }
  }
 }
 const legacy=analyzeTrace(input);
 const findings=input.findings.map(f=>{
  if(!calls.some(c=>['search_entity','traverse_graph'].includes(c.name)))return legacy.findings.find(p=>p.predictionId===f.id)!;
  const submission=calls.find(c=>c.name==='submit_review'&&!c.isError&&c.response?.accepted===true&&rows(c.args.findings).some(p=>canonical(p)===canonical(f)));
  const reads=f.evidence.map(e=>calls.find(c=>c.name==='read_source'&&ok(c)&&end(c)<(submission?.callEvent??-1)&&['snapshotId','revision','path','startLine','endLine','contentSha256'].every(k=>c.response?.[k]===e[k as keyof typeof e])));
  const chains=sourceLinks.filter(l=>l.strictNovel&&l.location.via?.direction==='upstream'&&l.location.via.pathResolved&&['CALLS','REFERENCES'].includes(l.location.via.relation)&&reads.some(r=>r?.id===l.sourceCallId));
  const valid=!trace.issues.length&&submission&&reads.length&&reads.every(Boolean);
  const relevant=graphs.some(g=>ok(g)&&rows(g.response?.items).some(i=>f.evidence.some(e=>e.path===i.path||e.path===i.sourcePath))&&g.callEvent<(submission?.callEvent??0));
  const before=reads.every(r=>r&&end(r)<(graphs[0]?.callEvent??Infinity));
  const discoveryPath=valid&&chains.length?'graph_assisted':valid&&(before||!relevant&&!graphs.some(g=>!ok(g)))?'text_only':'ambiguous';
  return {predictionId:f.id,discoveryPath,submissionCallId:submission?.id??null,sourceCallIds:reads.filter(Boolean).map(r=>r!.id),chains,reason:discoveryPath==='graph_assisted'?'Novel resolved incoming relation → later independent source read → accepted exact evidence':'Conservative native trace classification; no strict novel relation chain established'};
 });
 const count=(name:string)=>calls.filter(c=>c.name===name).length;
 const distribution=(field:string)=>Object.fromEntries([...new Set(traversal.map(c=>JSON.stringify(c.args[field]??null)))].map(v=>[v,traversal.filter(c=>JSON.stringify(c.args[field]??null)===v).length]));
 const stages=search.flatMap(c=>rows(c.response?.stages));
 const sum=(field:string)=>stages.reduce((n,s)=>n+Number(s[field]??0),0);
 const usage=trace.usage,available=usage.assistantResponses>0&&!usage.incompleteUsage;
 return {version:'locagent-trace-1',runKey:input.runKey,traceSha256:trace.sha256,traceIssues:trace.issues,findings,searchLinks,discoveries,sourceLinks,
  metrics:{toolCalls:calls.length,firstGraphToolOrdinal:graphs[0]?.ordinal??null,searchTextCalls:count('search_text'),readSourceCalls:count('read_source'),graphCalls:graphs.length,searchEntityCalls:count('search_entity'),traverseCalls:count('traverse_graph'),searchCalls:search.length,searchHits:search.filter(c=>ok(c)&&rows(c.response?.items).length).length,exactIdHits:sum('exactIdHits'),exactNameHits:sum('exactNameHits'),bm25EntityCalls:sum('bm25EntityCalls'),bm25ContentCalls:sum('bm25ContentCalls'),fuzzyCalls:sum('fuzzyCalls'),noResultCalls:search.filter(c=>ok(c)&&!rows(c.response?.items).length).length,resultCount:search.reduce((n,c)=>n+rows(c.response?.items).length,0),searchResponseBytes:search.reduce((n,c)=>n+Buffer.byteLength(c.resultText),0),traverseResponseBytes:traversal.reduce((n,c)=>n+Buffer.byteLength(c.resultText),0),renderModeDistribution:Object.fromEntries([...new Set(search.map(c=>String(c.response?.renderMode)))].map(m=>[m,search.filter(c=>String(c.response?.renderMode)===m).length])),hopDistribution:distribution('maxHops'),directionDistribution:distribution('direction'),relationFilterDistribution:distribution('relationTypeFilter'),nodeTypeFilterDistribution:distribution('entityTypeFilter'),returnedNodes:traversal.reduce((n,c)=>n+rows(c.response?.items).length,0),returnedEdges:traversal.reduce((n,c)=>n+rows(c.response?.edges??c.response?.items).length,0),multiHopTraversals:traversal.filter(c=>Number(c.args.maxHops)>1).length,novelEntities:discoveries.filter(d=>d.novelEntity).length,novelPaths:new Set(discoveries.filter(d=>d.novelPath).map(d=>d.path)).size,novelNeighborRate:discoveries.length?discoveries.filter(d=>d.novelEntity).length/discoveries.length:null,searchToTraverse:new Set(searchLinks.map(l=>l.searchCallId)).size,traverseToNovelEntity:new Set(discoveries.filter(d=>d.novelEntity).map(d=>d.traverseCallId)).size,novelEntityToSource:new Set(sourceLinks.filter(l=>l.strictNovel).map(l=>l.entityId)).size,sourceToAcceptedFinding:findings.filter(f=>f.discoveryPath==='graph_assisted').length,graphAssistedFindings:findings.filter(f=>f.discoveryPath==='graph_assisted').length,graphResponseBytes:graphs.reduce((n,c)=>n+Buffer.byteLength(c.resultText),0),rough_payload_estimate:Math.ceil(graphs.reduce((n,c)=>n+[...c.resultText].length,0)/4),inputTokens:available?usage.reportedInputTokens:null,outputTokens:available?usage.reportedOutputTokens:null,cacheReadTokens:available?usage.cacheReadTokens:null,totalTokens:available?usage.reportedTotalTokens:null},reportedPartialUsage:usage,
  calls:calls.map(c=>({id:c.id,name:c.name,ordinal:c.ordinal,args:c.args,response:c.response,callEvent:c.callEvent,resultEvent:c.resultEvent,isError:c.isError,responseBytes:Buffer.byteLength(c.resultText)}))};
}
