#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compareResults } = require('./compare-pr06.cjs');
const root = path.resolve(__dirname, '../..');
const outputDir = path.resolve(process.argv[2] || 'benchmarks/pr06');
fs.mkdirSync(outputDir, { recursive: true });
const configs = [[100,1],[1000,10],[5000,1],[10000,1]];
const summary = {schema:'layang-pr06-suite-v1', timestamp:new Date().toISOString(), runs:[]};
for(const [count,kb] of configs){
  const name=`mock-${count}-${kb}kb`;
  const output=path.join(outputDir,`${name}.json`);
  const args=['--expose-gc',path.join(__dirname,'mock-baseline.cjs'),'--scenario-count',String(count),'--payload-kb',String(kb),'--samples','12','--warmup','3','--output',output];
  const started=Date.now();
  const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:1024*1024});
  const item={name,exitCode:result.status,signal:result.signal||null,elapsedMs:Date.now()-started};
  if(result.error) item.error=result.error.message;
  if(result.status===0){
    const current=JSON.parse(fs.readFileSync(output,'utf8'));
    const baselinePath=path.join(root,'benchmarks/baseline',`${name}.json`);
    if(fs.existsSync(baselinePath)) item.comparison=compareResults(JSON.parse(fs.readFileSync(baselinePath,'utf8')),current);
    else item.comparison={comparable:false,reason:'Baseline missing'};
  } else item.stderr=(result.stderr||'').slice(-2000);
  summary.runs.push(item);
  console.log(`${name}: ${item.exitCode===0?'PASS':'FAIL'} (${item.elapsedMs}ms)`);
}
fs.writeFileSync(path.join(outputDir,'suite-summary.json'),`${JSON.stringify(summary,null,2)}\n`);
if(summary.runs.some(x=>x.exitCode!==0)) process.exitCode=1;
