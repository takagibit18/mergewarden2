import type { RelationFact, SymbolFact } from '../../graph/contracts.ts';
import type { GraphData, RetrievalConfig, SearchInput, TraverseInput } from './contracts.ts';
import { SparseIndex, fuzzyScore } from './sparse.ts';
const order = (a:string,b:string)=>a<b?-1:a>b?1:0;
const size = (v:unknown)=>Buffer.byteLength(JSON.stringify(v));
const measured = <T extends {responseBytes:number}>(value:T):T=>{let next=size(value);while(next!==value.responseBytes){value.responseBytes=next;next=size(value);}return value;};
const requireThat = (condition:unknown, message:string):void=>{if(!condition)throw Error(message);};
const isTest = (path:string)=>path.toLowerCase().split(/[ _/]/).some(p=>p.startsWith('test'));
export function entityName(s:SymbolFact):string {
  const module=s.path.replace(/\.py$/,'').replace(/\/__init__$/,'').replaceAll('/','.');
  return s.kind==='module'?s.path:`${s.path}:${s.qualifiedName.startsWith(module+'.')?s.qualifiedName.slice(module.length+1):s.qualifiedName}`;
}
const metadata=(s:SymbolFact)=>({entityId:s.id,entityName:entityName(s),snapshotId:s.snapshotId,kind:s.kind,name:s.name,qualifiedName:s.qualifiedName,path:s.path,startLine:s.startLine,endLine:s.endLine});
function glob(pattern:string,path:string):boolean {
  const parts=pattern.replaceAll('\\','/').split('**');
  const escape=(s:string)=>s.replace(/[.+^${}()|[\]\\]/g,'\\$&').replaceAll('*','[^/]*').replaceAll('?','[^/]');
  return new RegExp('^'+parts.map(escape).join('.*')+'$').test(path) || pattern==='**/*.py'&&path.endsWith('.py');
}
/** Retrieval over already-resolved immutable Graph data. It never creates semantic edges. */
export class LocAgentRetrieval {
  private data:GraphData; private config:RetrievalConfig; private symbols:SymbolFact[];
  private byId:Map<string,SymbolFact>; private entities:SparseIndex; private contents:SparseIndex;
  private chunks:{symbol:SymbolFact;startLine:number;endLine:number;text:string}[]=[];
  constructor(data:GraphData,config:RetrievalConfig={}) {
    this.data=data;this.config=config;
    requireThat(Number.isInteger(config.maxHops??20)&&(config.maxHops??20)>=1&&(config.maxHops??20)<=20,'Invalid configured hop bound');
    this.symbols=data.symbols.filter(s=>!isTest(s.path)).sort((a,b)=>order(entityName(a),entityName(b))||order(a.id,b.id));
    this.byId=new Map(this.symbols.map(s=>[s.id,s]));
    for(const s of this.symbols)requireThat(s.snapshotId===data.snapshotId,'Cross-snapshot symbol');
    for(const e of data.relations)requireThat(e.snapshotId===data.snapshotId,'Cross-snapshot relation');
    // Entity ID includes path/module and the nested entity name, as in the reference.
    this.entities=new SparseIndex(this.symbols.map(entityName));
    let bytes=0;
    for(const s of this.symbols){
      const lines=(data.sources[s.path]??'').split('\n');
      for(let first=s.startLine;first<=Math.min(s.endLine,lines.length);first+=200){
        const last=Math.min(first+199,s.endLine,lines.length),text=lines.slice(first-1,last).join('\n');bytes+=Buffer.byteLength(text);
        requireThat(bytes<=64*1024*1024&&this.chunks.length<200_000,'Retrieval content index bound exceeded');
        this.chunks.push({symbol:s,startLine:first,endLine:last,text});
      }
    }
    this.contents=new SparseIndex(this.chunks.map(c=>c.text));
  }
  private envelope(){return {status:this.data.coverage.parseIncompleteFiles?'parse_incomplete':this.data.coverage.unsupportedFiles||!this.data.coverage.eligibleFiles?'unsupported':'ok',snapshotId:this.data.snapshotId,revision:'head',coverage:this.data.coverage,warnings:[...this.data.warnings.slice(0,10).map(w=>w.slice(0,512)),'LocAgent-style retrieval excludes test paths. Candidate matches and previews are exploration only; use read_source for evidence.'],explorationOnly:true};}
  private exact(term:string):SymbolFact[]{const found=this.symbols.filter(s=>s.id===term||entityName(s)===term||s.qualifiedName===term);return found.length||!term.endsWith('.__init__')?found:this.exact(term.slice(0,-9));}
  private preview(s:SymbolFact,mode:string){
    if(mode==='fold')return {};
    const lines=(this.data.sources[s.path]??'').split('\n'),end=Math.min(s.endLine,s.startLine+(mode==='full'?99:5));
    const selected=lines.slice(s.startLine-1,end).join('\n'),text=Buffer.from(selected).subarray(0,mode==='full'?8192:1024).toString('utf8');
    return {preview:{revision:'head',path:s.path,startLine:s.startLine,endLine:end,text,truncated:end<s.endLine||text!==selected,explorationOnly:true}};
  }
  search(input:SearchInput){
    requireThat(this.config.searchEntityEnabled!==false,'search_entity disabled by eval configuration');
    requireThat(Array.isArray(input.searchTerms)&&input.searchTerms.length>=1&&input.searchTerms.length<=5&&input.searchTerms.every(t=>typeof t==='string'&&t.trim().length>0&&t.length<=256),'Expected 1..5 bounded search terms');
    requireThat(Number.isInteger(input.topK)&&input.topK>=1&&input.topK<=10,'topK must be 1..10');
    requireThat(input.filePattern===undefined||typeof input.filePattern==='string'&&input.filePattern.length>0&&input.filePattern.length<=256,'Invalid file pattern');
    const selected=this.symbols.filter(s=>!input.filePattern||glob(input.filePattern,s.path));
    const include=selected.length?new Set(selected.map(s=>s.id)):new Set(this.symbols.map(s=>s.id));
    type Hit={s:SymbolFact;matchMode:string;score?:number;renderMode:string;query:string;contentRange?:{startLine:number;endLine:number}};
    const hits:Hit[]=[],stages:{query:string;exactIdHits:number;exactNameHits:number;bm25EntityCalls:number;bm25ContentCalls:number;fuzzyCalls:number}[]=[];
    const terms=[...input.searchTerms];if(terms.length>1)terms.push(terms.join(' '));
    for(const raw of terms){
      const term=raw.trim().replace(/^\.+|\.+$/g,'');if(!term)continue;
      const stage={query:term,exactIdHits:0,exactNameHits:0,bm25EntityCalls:0,bm25ContentCalls:0,fuzzyCalls:0};stages.push(stage);
      let found=this.exact(term);
      if(found.length===1){stage.exactIdHits=1;hits.push({s:found[0]!,matchMode:'exact_id',renderMode:terms.length===1?'full':'preview',query:term});continue;}
      let clean=term.replace(/^(class|function|method|def)\s+/i,'');
      const byName=(name:string,scope:boolean)=>{const candidates=this.symbols.filter(s=>!scope||include.has(s.id));const names=(s:SymbolFact)=>[s.name,...(s.kind==='module'?[s.path.split('/').at(-1)!,s.path.split('/').at(-1)!.replace(/\.py$/,'')]:[])];const exact=candidates.filter(s=>names(s).includes(name));return exact.length?exact:candidates.filter(s=>names(s).some(n=>n.toLowerCase()===name.toLowerCase()));};
      found=byName(clean,true);if(!found.length)found=byName(clean,false);
      let continueSparse=false;
      if(!found.length&&clean.includes('.')){
        const names=clean.split('.'),suffix=names.pop()!,prefix=names.map(s=>s.toLowerCase());
        const all=byName(suffix,false),matching=all.filter(s=>prefix.every(p=>entityName(s).toLowerCase().replace('.py','').split(/[./:]/).slice(0,-1).includes(p)));
        found=matching.length?matching:all;continueSparse=!matching.length;
      }
      if(found.length){stage.exactNameHits=found.length;for(const s of found)hits.push({s,matchMode:'exact_name',renderMode:found.length<=3?'preview':'fold',query:term});if(!continueSparse)continue;}
      if(this.config.bm25Enabled!==false){
        stage.bm25EntityCalls++;
        const all=this.entities.search(term,10),local=all.filter(r=>include.has(this.symbols[r.index]!.id));
        for(const row of (local.length?local:all).slice(0,5)){const s=this.symbols[row.index]!;hits.push({s,matchMode:'bm25_entity',score:row.score,renderMode:s.kind==='module'?'fold':'preview',query:term});}
        // Reference keeps continue_search true after BM25 entity hits, so content is supplemental.
        stage.bm25ContentCalls++;
        const chunks=this.contents.search(term,10).filter(r=>include.has(this.chunks[r.index]!.symbol.id));
        for(const row of chunks.slice(0,5)){const chunk=this.chunks[row.index]!;hits.push({s:chunk.symbol,matchMode:'bm25_content',score:row.score,renderMode:'preview',query:term,contentRange:{startLine:chunk.startLine,endLine:chunk.endLine}});}
      }
      // Task requires fuzzy LAST. Reference invokes it before content; explicitly documented adaptation.
      if(this.config.fuzzyEnabled!==false&&!hits.some(h=>h.query===term)){
        stage.fuzzyCalls++;
        const candidates=this.symbols.map(s=>({s,score:fuzzyScore(term,entityName(s))})).sort((a,b)=>b.score-a.score||order(entityName(a.s),entityName(b.s))).slice(0,3);
        for(const row of candidates)hits.push({s:row.s,matchMode:'fuzzy',score:row.score,renderMode:row.s.kind==='module'?'fold':'preview',query:term});
      }
    }
    // Preserve all retrieval modes on deduplicated entities, while retaining exact-first ordering.
    const grouped=new Map<string,Hit[]>();for(const h of hits)grouped.set(h.s.id,[...grouped.get(h.s.id)??[],h]);
    const all=[...grouped.values()];let truncated=all.length>input.topK;
    const result={...this.envelope(),items:[] as Record<string,unknown>[],truncated:false,stages,resultCount:0,renderMode:'fold',retrievalMode:[...new Set(hits.map(h=>h.matchMode))],responseBytes:0};
    for(const group of all.slice(0,input.topK)){
      const priority:Record<string,number>={full:0,preview:1,fold:2};
      const first=[...group].sort((a,b)=>priority[a.renderMode]!-priority[b.renderMode]!)[0]!;let mode=this.config.sourcePolicy==='fold'?'fold':this.config.sourcePolicy==='preview'&&first.renderMode==='full'?'preview':first.renderMode;
      if(all.length>3)mode='fold';
      const item={...metadata(first.s),matchMode:first.matchMode,matchModes:[...new Set(group.map(h=>h.matchMode))],renderMode:mode,...(first.score!==undefined?{retrievalScore:first.score}:{}),matches:group.map(h=>({query:h.query,matchMode:h.matchMode,...(h.score!==undefined?{retrievalScore:h.score}:{}),...(h.contentRange?{contentRange:h.contentRange}:{})})),...this.preview(first.s,mode)};
      result.items.push(item);if(size(result)>30_000){result.items.pop();truncated=true;break;}
    }
    result.truncated=truncated;result.resultCount=result.items.length;result.renderMode=[...new Set(result.items.map(i=>String(i.renderMode)))].join('+')||'fold';
    if(truncated)result.warnings.push('Bounded candidate output; refine the query to retrieve omitted entities.');
    return measured(result);
  }
  traverse(input:TraverseInput){
    requireThat(this.config.traverseEnabled!==false,'traverse_graph disabled by eval configuration');
    requireThat(Array.isArray(input.startEntities)&&input.startEntities.length>=1&&input.startEntities.length<=5&&input.startEntities.every(s=>typeof s==='string'&&s.length>0&&s.length<=512),'Expected 1..5 bounded start entities');
    requireThat(['upstream','downstream','both'].includes(input.direction),'Invalid direction');
    requireThat(Number.isInteger(input.maxHops)&&input.maxHops>=1&&input.maxHops<=20,'maxHops must be 1..20');
    requireThat(Number.isInteger(input.maxNodes)&&input.maxNodes>=1&&input.maxNodes<=100,'maxNodes must be 1..100');
    requireThat(Array.isArray(input.entityTypeFilter)&&input.entityTypeFilter.every(k=>['module','class','function','method'].includes(k)),'Invalid entity type filter');
    requireThat(Array.isArray(input.relationTypeFilter)&&input.relationTypeFilter.every(k=>['CONTAINS','IMPORTS','REFERENCES','CALLS'].includes(k)),'Invalid relation type filter');
    const maxBytes=input.maxBytes??32768;requireThat(Number.isInteger(maxBytes)&&maxBytes>=2048&&maxBytes<=32768,'maxBytes must be 2048..32768');
    const maxHops=Math.min(input.maxHops,this.config.maxHops??20);
    const roots:SymbolFact[]=[],hints:{query:string;matchMode:string;candidates:ReturnType<typeof metadata>[]}[]=[];
    for(const id of input.startEntities){const found=this.exact(id);if(found.length===1)roots.push(found[0]!);else hints.push({query:id,matchMode:'bm25_entity',candidates:this.entities.search(id,10).slice(0,5).map(r=>metadata(this.symbols[r.index]!))});}
    requireThat(new Set(roots.map(r=>r.id)).size<=input.maxNodes,'maxNodes is smaller than the root set');
    const items:Record<string,unknown>[]=[],edges:RelationFact[]=[],lines:string[]=[],nodeIds=new Set<string>(),edgeIds=new Set<string>();
    const result={...this.envelope(),items,edges,tree:'',hints,truncated:false,maxHops,direction:input.direction,resultCount:0,returnedEdges:0,responseBytes:0};
    if(hints.length)result.warnings.push('Invalid start entities were not traversed. BM25 hints identify candidates only; retry with an exact returned entity ID. Empty output does not establish absence.');
    while(size(result)>maxBytes-512&&hints.some(h=>h.candidates.length)){hints.findLast(h=>h.candidates.length)!.candidates.pop();result.truncated=true;}
    while(size(result)>maxBytes-512&&hints.length){hints.pop();result.truncated=true;}
    let omittedDiagnostics=false;
    while(size(result)>maxBytes-512&&result.warnings.length>1){result.warnings.shift();result.truncated=true;omittedDiagnostics=true;}
    if(omittedDiagnostics)result.warnings.unshift('Some diagnostic details were omitted to respect maxBytes; inspect coverage.');
    const incoming=new Map<string,RelationFact[]>(),outgoing=new Map<string,RelationFact[]>();
    for(const edge of this.data.relations){outgoing.set(edge.fromId,[...outgoing.get(edge.fromId)??[],edge]);incoming.set(edge.toId,[...incoming.get(edge.toId)??[],edge]);}
    const fits=()=>size({...result,tree:lines.join('\n')})<=maxBytes-512;
    let stopped=false;
    for(const root of roots){
      const visited=new Set<string>(),structuralEdges=new Set<string>();
      const visit=(s:SymbolFact,prefix:string,depth:number,direction:string,via?:RelationFact,pathResolved=true)=>{
        if(stopped)return;
        const fresh=!nodeIds.has(s.id);
        if(fresh&&nodeIds.size>=input.maxNodes){result.truncated=true;return;}
        const line=depth===0?`${entityName(s)} [${s.kind}; id=${s.id}]`:`${prefix}└── ${via!.relation}${direction==='upstream'?'-by ←':' →'} [${via!.resolution}] ${entityName(s)} [${s.kind}; id=${s.id}]`;
        if(fresh){nodeIds.add(s.id);items.push({...metadata(s),depth,rootEntityId:root.id,...(via?{discoveredVia:{edgeId:via.id,relation:via.relation,direction,resolution:via.resolution,pathResolved}}:{})});}
        let newEdge=false;if(via&&!edgeIds.has(via.id)){edges.push(via);edgeIds.add(via.id);newEdge=true;}
        lines.push(line);
        if(edges.length>200||!fits()){
          lines.pop();if(fresh){nodeIds.delete(s.id);items.pop();}if(newEdge){edges.pop();edgeIds.delete(via!.id);}result.truncated=true;stopped=true;return;
        }
        if(depth>=maxHops||visited.has(s.id))return;visited.add(s.id);
        const dirs=depth===0&&direction==='both'?['downstream','upstream']:[direction];
        for(const dir of dirs){
          const neighbors=(dir==='upstream'?incoming:outgoing).get(s.id)??[];
          for(const edge of [...neighbors].sort((a,b)=>order(entityName(this.byId.get(dir==='upstream'?a.fromId:a.toId)??s),entityName(this.byId.get(dir==='upstream'?b.fromId:b.toId)??s))||order(a.relation,b.relation)||order(a.id,b.id))){
            const next=this.byId.get(dir==='upstream'?edge.fromId:edge.toId);if(!next)continue;
            if(input.relationTypeFilter.length&&!input.relationTypeFilter.includes(edge.relation)||input.entityTypeFilter.length&&!input.entityTypeFilter.includes(next.kind))continue;
            const key=JSON.stringify([edge.fromId,edge.relation,edge.toId]);if(structuralEdges.has(key))continue;structuralEdges.add(key);
            visit(next,prefix+'    ',depth+1,dir,edge,pathResolved&&['resolved_scoped','resolved_import_alias'].includes(edge.resolution));
          }
        }
      };
      visit(root,'',0,input.direction);
    }
    result.tree=lines.join('\n');result.resultCount=items.length;result.returnedEdges=edges.length;
    if(result.truncated)result.warnings.push('Traversal output bound reached; query a narrower root/filter/depth. Omitted nodes do not establish absence.');
    if(!items.length&&roots.length)throw Error('Even one entity exceeds the requested output bound');
    return measured(result);
  }
}
