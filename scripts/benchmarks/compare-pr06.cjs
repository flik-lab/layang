'use strict';
function compareResults(baseline,current){
  const a=baseline.environment||{},b=current.environment||{};
  const sameConfig=baseline.config?.scenarioCount===current.config?.scenarioCount && baseline.config?.payloadKb===current.config?.payloadKb && baseline.config?.seed===current.config?.seed;
  const sameRuntime=a.node===b.node && a.platform===b.platform && a.arch===b.arch && a.cpu===b.cpu;
  const phases={};
  for(const [name,value] of Object.entries(current.phases||{})){
    const previous=baseline.phases?.[name];
    if(previous && Number.isFinite(previous.p95Ms) && Number.isFinite(value.p95Ms)){
      phases[name]={baselineP95Ms:previous.p95Ms,currentP95Ms:value.p95Ms,deltaPercent:previous.p95Ms===0?null:Number(((value.p95Ms/previous.p95Ms-1)*100).toFixed(1))};
    }
  }
  return {comparable:sameConfig&&sameRuntime,reason:!sameConfig?'Fixture config differs':!sameRuntime?'Runtime, OS or CPU differs; deltas are informational only':'Comparable environment; still subject to load/noise',phases};
}
module.exports={compareResults};
