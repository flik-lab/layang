#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createMockScenarioWorkload}=require('../../tests/fixtures/pr00-mock-workload.cjs');
const {parseScenarioBundle}=require('../../lib/workspace-v6-codec.cjs');
if(typeof global.gc!=='function') {console.error('Requires node --expose-gc');process.exit(2);}
const cycles=8, scenarioCount=1000;
const heap=[];
for(let i=0;i<cycles;i++){
  {
    const workload=createMockScenarioWorkload({scenarioCount,payloadKb:1,seed:42+i});
    let total=0;
    for(const f of Object.values(workload.methodFiles)) total+=parseScenarioBundle(f).scenarios.length;
    if(total!==scenarioCount)throw new Error(`Unexpected count: ${total}`);
  }
  global.gc();global.gc();
  heap.push(Math.round(process.memoryUsage().heapUsed/1024));
}
const result={schema:'layang-pr06-retention-probe-v1',scope:'Node synthetic allocate/parse/release only; NOT Electron UI, gRPC stream or proof of leak freedom',node:process.version,cycles,scenarioCount,heapUsedAfterGcKiB:heap,firstToLastDeltaKiB:heap.at(-1)-heap[0],status:'OBSERVATION_ONLY'};
const output=process.argv[2];
if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify(result,null,2));
