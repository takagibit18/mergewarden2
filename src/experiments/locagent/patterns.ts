import type {Relation,RelationFact,SymbolFact} from '../../graph/contracts.ts';
import type {ExplorationBudget} from './contracts.ts';
export interface TraversalStep {relations:readonly Relation[];direction:'upstream'|'downstream'}
export interface TraversalPattern {id:string;steps:readonly TraversalStep[]}
const step=(relation:Relation,direction:TraversalStep['direction']):TraversalStep=>Object.freeze({relations:Object.freeze([relation]),direction});
const pattern=(id:string,steps:TraversalStep[]):TraversalPattern=>Object.freeze({id,steps:Object.freeze(steps)});
/** Pre-registered V2 patterns. No repository, symbol-name or audit-dependent policy. */
export const STRUCTURAL_PATTERNS:readonly TraversalPattern[]=Object.freeze([
 pattern('calls-out',[step('CALLS','downstream'),step('CALLS','downstream'),step('CALLS','downstream')]),
 pattern('calls-in',[step('CALLS','upstream'),step('CALLS','upstream')]),
 pattern('imports',[step('IMPORTS','downstream'),step('IMPORTS','upstream')]),
 pattern('bases',[step('INHERITS','downstream')]),pattern('derived',[step('INHERITS','upstream')])
]);
export interface PatternDiscovery {entity:SymbolFact;depth:number;rootEntityId:string;direction:string;via?:RelationFact;parentStateId?:number;stateId:number;patternId:string;show:boolean}
interface State {discovery:PatternDiscovery;edges:readonly RelationFact[];cursor:number}
interface Lane {pattern:TraversalPattern;depth:number;current:State[];next:PatternDiscovery[];seen:Set<string>}
export function progressiveWalk(roots:SymbolFact[],patterns:readonly TraversalPattern[],budget:ExplorationBudget,beamWidth:number,
 access:{entity(id:string):SymbolFact|undefined;neighbors(id:string,direction:TraversalStep['direction']):readonly RelationFact[];compare(a:SymbolFact,b:SymbolFact):number},signal?:AbortSignal){
 for(const value of [beamWidth,budget.maxVisitedNodes,budget.maxVisitedEdges,budget.maxExpandedStates])if(!Number.isSafeInteger(value)||value<1)throw Error('Invalid progressive traversal bound');
 if(new Set(roots.map(r=>r.id)).size>budget.maxVisitedNodes)throw Error('Exploration budget is smaller than root set');
 const discoveries:PatternDiscovery[]=[],nodes=new Set<string>(),lanes:Lane[]=[];let visitedEdges=0,expandedStates=0,frontierDropped=0,stopReason='frontier_exhausted',depthReached=false,stopped=false;
 const droppedFrontier:{entityId:string;patternId:string;depth:number}[]=[];
 const record=(entity:SymbolFact,rootEntityId:string,patternId:string,depth:number,direction:string,via?:RelationFact,parentStateId?:number)=>{const d={entity,rootEntityId,patternId,depth,direction,...(via?{via}:{}),...(parentStateId===undefined?{}:{parentStateId}),stateId:discoveries.length,show:true};discoveries.push(d);nodes.add(entity.id);return d;};
 for(const root of roots)for(const p of patterns){if(!p.steps.length)continue;const d=record(root,root.id,p.id,0,p.steps[0]!.direction);lanes.push({pattern:p,depth:0,current:[{discovery:d,edges:access.neighbors(root.id,p.steps[0]!.direction),cursor:0}],next:[],seen:new Set([`0:${root.id}`])});}
 const advance=(lane:Lane)=>{
   while(true){
     while(lane.current.length&&lane.current[0]!.cursor>=lane.current[0]!.edges.length)lane.current.shift();
     if(lane.current.length||!lane.next.length)return;
     const ranked=lane.next.sort((a,b)=>access.compare(a.entity,b.entity)||a.stateId-b.stateId);
     for(const d of ranked.slice(beamWidth)){frontierDropped++;droppedFrontier.push({entityId:d.entity.id,patternId:d.patternId,depth:d.depth});}
     lane.depth++;lane.current=ranked.slice(0,beamWidth).map(discovery=>({discovery,edges:access.neighbors(discovery.entity.id,lane.pattern.steps[lane.depth]!.direction),cursor:0}));lane.next=[];
   }
 };
 while(!stopped){let active=false;
  for(const lane of lanes){
   signal?.throwIfAborted();advance(lane);const state=lane.current[0];if(!state)continue;active=true;
   if(state.cursor===0){if(expandedStates>=budget.maxExpandedStates){stopReason='expanded_states';stopped=true;break;}expandedStates++;}
   if(visitedEdges>=budget.maxVisitedEdges){stopReason='visited_edges';stopped=true;break;}
   const edge=state.edges[state.cursor++]!;visitedEdges++;
   const rule=lane.pattern.steps[lane.depth]!;
   if(!rule.relations.includes(edge.relation)||!['resolved_scoped','resolved_import_alias'].includes(edge.resolution))continue;
   const entity=access.entity(rule.direction==='upstream'?edge.fromId:edge.toId);if(!entity)continue;
   if(!nodes.has(entity.id)&&nodes.size>=budget.maxVisitedNodes){stopReason='visited_nodes';stopped=true;break;}
   const depth=lane.depth+1,key=`${depth}:${entity.id}`;if(lane.seen.has(key))continue;lane.seen.add(key);
   const d=record(entity,state.discovery.rootEntityId,lane.pattern.id,depth,rule.direction,edge,state.discovery.stateId);
   if(depth<lane.pattern.steps.length)lane.next.push(d);else depthReached=true;
  }
  if(!active)break;
 }
 if(!stopped&&depthReached)stopReason='depth_reached';
 return {discoveries,visitedNodes:nodes.size,visitedEdges,expandedStates,frontierDropped,droppedFrontier,stopReason,coverageLimited:stopped||frontierDropped>0};
}
