"use strict";
/** Reproducible file-based indexing/hydration benchmark, independent from Electron. */
const fs=require("node:fs/promises");
const os=require("node:os");
const path=require("node:path");
const {performance}=require("node:perf_hooks");
const {GrpcScenarioRepository,relativeRef}=require("../../lib/grpc-scenario-repository.cjs");
const {stringifyYaml}=require("../../lib/workspace-yaml.cjs");
const {writeGitWorkspace}=require("../../lib/git-workspace.cjs");

async function benchmark(n,payloadKb=1) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"layang-v3-bench-"));
 const repo=new GrpcScenarioRepository(root);
 try {
  await writeGitWorkspace(root,{project:{collections:[],protoLibraries:[],environments:[],mockServer:{methodFiles:{}}},layout:{},settings:{}});
  const start=performance.now();
  for(let offset=0;offset<n;offset+=48){
   await Promise.all(Array.from({length:Math.min(48,n-offset)},async(_,j)=>{
    const i=offset+j;
    const ref={methodKey:`bench.Radar/Rpc${i%100}`,scenarioId:`scenario-${i}`};
    const file=path.join(root,relativeRef(ref));
    await fs.mkdir(path.dirname(file),{recursive:true});
    await fs.writeFile(file,stringifyYaml({version:3,kind:"grpc-scenario",id:ref.scenarioId,methodKey:ref.methodKey,revision:1,
      scenario:{id:ref.scenarioId,name:`Scenario ${i}`,stream:{responses:[{data:{payload:"x".repeat(payloadKb*1024)}}]}}}));
   }));
  }
  const writtenMs=performance.now()-start;
  const coldStart=performance.now();const cold=await repo.listMetadata();const coldMs=performance.now()-coldStart;
  const warmStart=performance.now();const warm=await repo.listMetadata();const warmMs=performance.now()-warmStart;
  const first=warm.items[Math.floor(n/2)];
  const readStart=performance.now();const one=await repo.read(first);const hydrateMs=performance.now()-readStart;
  const scopedStart=performance.now();
  const scoped=await repo.buildRuntimeSnapshot({methodKey:first.methodKey,ref:first,
    revision:first.revision,contentHash:first.contentHash});
  const scopedCompileMs=performance.now()-scopedStart;
  if(cold.items.length!==n||warm.items.length!==n||!warm.cached||!one.sourceText ||
     scoped.count!==n/100 || scoped.scenarios.some(x=>`${x.service}/${x.method}`!==first.methodKey))
    throw new Error("Invalid benchmark result");
  if(typeof global.gc==="function") global.gc();
  return {scenarios:n,payloadKb,fileWriteMs:+writtenMs.toFixed(1),coldIndexMs:+coldMs.toFixed(1),warmIndexMs:+warmMs.toFixed(1),oneHydrateMs:+hydrateMs.toFixed(2),methodScopedCompileMs:+scopedCompileMs.toFixed(1),compiledMethodScenarios:scoped.count,heapUsedMiB:+(process.memoryUsage().heapUsed/1024/1024).toFixed(2),rssMiB:+(process.memoryUsage().rss/1024/1024).toFixed(2)};
 } finally {await fs.rm(root,{recursive:true,force:true});}
}
(async()=>{
 const sizes=process.argv.slice(2).filter(x=>/^\d+$/.test(x)).map(Number);
 const out=[];
 for(const n of sizes.length?sizes:[100,1000,5000,10000]) {const result=await benchmark(n);out.push(result);console.log(JSON.stringify(result));}
 console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,results:out},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
