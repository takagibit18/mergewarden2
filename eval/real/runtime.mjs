import {createModelRuntime,createPiRuntime} from '../../integrations/pi/src/runtime.ts';
/** Evaluation-only model budgets through Pi's public provider registration API.
 * Reuse the existing runtime/session/tool loop. Never modify the product catalog.
 */
export function createEvaluationRuntimeFactory(key,experiment){
 if(!key?.trim())throw Error('Explicit credential environment unavailable');
 const {maxTokens,providerReasoningEffort='provider-default'}=experiment;
 if(!Number.isInteger(maxTokens)||maxTokens<8192||maxTokens>32768||!['provider-default','low','high','max'].includes(providerReasoningEffort))throw Error('Invalid evaluation model budget');
 return async options=>{
  const catalog=await createModelRuntime(options.model.provider,key);
  const auth=await catalog.getAuth(options.model.provider,{apiKey:key});
  if(auth?.auth.apiKey!==key)throw Error('Explicit credential configuration mismatch');
  const model=catalog.getModel(options.model.provider,options.model.modelId);
  if(!model||options.model.provider!=='bigmodel'||options.model.modelId!=='glm-5.3-flash')throw Error('Unsupported evaluation model');
  catalog.registerProvider('bigmodel',{models:[{...model,maxTokens,...(providerReasoningEffort==='provider-default'?{}:{compat:{...model.compat,supportsReasoningEffort:true},thinkingLevelMap:{...model.thinkingLevelMap,medium:providerReasoningEffort}})}]});
  const runtime=await createPiRuntime(options,catalog),configuration=runtime.configuration;
  return {...runtime,configuration(){return {...configuration(),providerReasoningEffort};}};
 };
}
