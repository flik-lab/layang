"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { GrpcScenarioRepository, relativeRef } = require("../lib/grpc-scenario-repository.cjs");
const { writeGitWorkspace } = require("../lib/git-workspace.cjs");
const { stringifyYaml } = require("../lib/workspace-yaml.cjs");
const { registerGrpcScenarioStoreIpc } = require("../electron/ipc/grpc-scenario-store-ipc.cjs");
const setup = async () => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), "layang-v3-"));
 await writeGitWorkspace(root, { project:{ collections:[], protoLibraries:[], environments:[], mockServer:{methodFiles:{}} }, layout:{}, settings:{} });
 return {root, repo:new GrpcScenarioRepository(root)};
};
const ref={methodKey:"tactical_display_area.TacticalDisplayAreaService/RadarPlotStream",scenarioId:"scenario-1"};
const source=(name="First")=>stringifyYaml({ id:ref.scenarioId,name,enabled:true, stream:{responses:[{data:{radarPlotData:{plotId:1}}}]} });
describe("v3 file-based gRPC scenario repository",()=>{
 it("updates streaming delivery by revision without returning the YAML or changing responses", async t => {
  const {root, repo} = await setup();
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  const initial = await repo.save(ref, source().replace("stream:\n", "stream:\n  execution:\n    mode: incoming\n    timeoutMs: 90000\n"), {expectedRevision:0});
  const expected = {expectedRevision:initial.saved.revision, expectedHash:initial.saved.contentHash};
  const settings = {mode:"hybrid", intervalMs:1500, loop:true, maxExecutions:3};
  const result = await repo.updateExecution(ref, expected, settings);
  assert.equal(result.ok, true);
  assert.equal(result.saved.sourceText, undefined);
  assert.equal(result.saved.execution.manual, true);
  assert.equal(result.saved.execution.timeoutMs, 90000);
  assert.equal(result.saved.execution.periodic.intervalMs, 1500);
  assert.equal(result.saved.execution.periodic.maxExecutions, 3);
  assert.deepEqual((await repo.listMetadata()).items[0].execution, result.saved.execution);
  assert.deepEqual((await repo.read(ref)).scenario.stream.responses, [{data:{radarPlotData:{plotId:1}}}]);
  assert.equal((await repo.updateExecution(ref, expected, {...settings, mode:"standby"})).ok, false);
 });
 it("saves one scenario, lists metadata without responses, reuses index and reads on demand",async()=>{
  const {root,repo}=await setup();
  try{
   const saved=await repo.save(ref,source(),{expectedRevision:0,expectedHash:""});
   assert.equal(saved.ok,true);
   const cold=await repo.listMetadata();
   assert.equal(cold.cached,false);assert.equal(cold.items.length,1);
   assert.equal(cold.items[0].name,"First");
   assert.equal(JSON.stringify(cold).includes("radarPlotData"),false);
   const warm=await new GrpcScenarioRepository(root).listMetadata();assert.equal(warm.cached,true);
   const read=await repo.read(ref);assert.equal(read.revision,1);
   assert.equal(read.scenario.stream.responses[0].data.radarPlotData.plotId,1);
   const changed=await repo.save(ref,source("Later"),{expectedRevision:read.revision,expectedHash:read.contentHash});
   assert.equal(changed.ok,true);assert.equal(changed.saved.revision,2);
   assert.equal((await repo.listMetadata()).items[0].name,"Later");
  } finally{await fs.rm(root,{recursive:true,force:true});}
 });
 it("rejects stale hash, stale revision and simultaneous CAS writes",async()=>{
  const {root,repo}=await setup();try{
   assert.equal((await repo.save(ref,source(),{expectedRevision:0})).ok,true);
   const baseline=await repo.read(ref);
   const results=await Promise.all([
    repo.save(ref,source("A"),{expectedRevision:1,expectedHash:baseline.contentHash}),
    repo.save(ref,source("B"),{expectedRevision:1,expectedHash:baseline.contentHash})]);
   assert.equal(results.filter(x=>x.ok).length,1);
   const current=await repo.read(ref);
   assert.equal(current.revision,2);
   assert.equal((await repo.remove(ref,{expectedRevision:1,expectedHash:baseline.contentHash})).ok,false);
   assert.equal((await repo.remove(ref,{expectedRevision:2,expectedHash:current.contentHash})).ok,true);
  }finally{await fs.rm(root,{recursive:true,force:true});}
 });
 it("rejects symlink escape and oversized scenario",async()=>{
  const {root,repo}=await setup();try{
   const target=path.join(root,"mocks","grpc","scenarios");
   await fs.mkdir(path.dirname(target),{recursive:true});
   await fs.symlink(os.tmpdir(),target,process.platform === "win32" ? "junction" : "dir");
   await assert.rejects(()=>repo.save(ref,source(),{expectedRevision:0}),/Symlink/);
   await assert.rejects(()=>repo.save(ref,"X".repeat(33*1024*1024),{expectedRevision:0}),/size limit/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
 });
 it("recovers from a corrupt metadata index, reflecting direct edits",async()=>{
  const {root,repo}=await setup();try{
   await repo.save(ref,source(),{expectedRevision:0});await repo.listMetadata();
   await fs.writeFile(repo.indexFile,"{broken");
   assert.equal((await repo.listMetadata()).items.length,1);
   const file=path.join(root,relativeRef(ref));
   const text=await fs.readFile(file,"utf8");
   await fs.writeFile(file,text.replace("First","Other"));
   assert.equal((await repo.listMetadata()).items[0].name,"Other");
  }finally{await fs.rm(root,{recursive:true,force:true});}
 });
 it("performs verified migration, archives legacy source, and is idempotent",async()=>{
  const {root,repo}=await setup();try{
   const methodDir=path.join(root,"mocks","grpc","methods");await fs.mkdir(methodDir,{recursive:true});
   const legacyFile=path.join(methodDir,"method.mock.yml");
   await fs.writeFile(legacyFile,stringifyYaml({version:2,kind:"grpc-mock",method:{service:"tactical_display_area.TacticalDisplayAreaService",name:"RadarPlotStream"},scenarios:[{id:"scenario-1",name:"Legacy",response:{data:{x:1}}}]}));
   const before=await fs.readFile(legacyFile,"utf8");
   const dry=await repo.migrateLegacy();assert.equal(dry.scenarios,1);
   assert.equal((await repo.scanFiles()).length,0);
   const migration=await repo.migrateLegacy({dryRun:false});assert.equal(migration.migrated,1);
   await assert.rejects(()=>fs.readFile(legacyFile,"utf8"),/ENOENT/);
   assert.equal((await fs.readFile(path.join(migration.backupPath,"methods","method.mock.yml"),"utf8")),before);
   assert.equal((await repo.read(ref)).scenario.name,"Legacy");
   assert.equal((await repo.migrateLegacy({dryRun:false})).migrated,0);
  }finally{await fs.rm(root,{recursive:true,force:true});}
 });
 it("IPC maps failures explicitly without trusting renderer paths",async()=>{
  const handlers=new Map(); registerGrpcScenarioStoreIpc({handle:(key,handler)=>handlers.set(key,handler)});
  assert.ok(handlers.has("mock-scenario:list"));
  const missing=await handlers.get("mock-scenario:list")(null,{});
  assert.equal(missing.ok,false);
 });
 it("migrates a legacy scenario over 8 MiB during workspace save without loading it into the editor", async t => {
  const { root, repo } = await setup();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const legacy = path.join(root, "mocks", "grpc", "scenarios.yml");
  const value = "x".repeat(9 * 1024 * 1024);
  const [service, method] = ref.methodKey.split("/");
  const document = stringifyYaml({ scenarios: [{ id: ref.scenarioId, service, method, response: { data: { value } } }] });
  await fs.mkdir(path.dirname(legacy), { recursive: true });
  await fs.writeFile(legacy, document);
  await writeGitWorkspace(root, { project: {}, layout: {}, settings: {} });
  await assert.rejects(fs.stat(legacy), { code: "ENOENT" });
  const backups = (await fs.readdir(path.join(root, ".layang"))).filter(name => name.startsWith("grpc-v3-backup-"));
  assert.equal(backups.length, 1);
  assert.ok(await fs.readFile(path.join(root, ".layang", backups[0], "scenarios.yml"), "utf8") === document);
  const snapshot = await repo.buildRuntimeSnapshot({ methodKey: ref.methodKey });
  assert.ok(snapshot.scenarios[0].response.data.value === value);
  const handlers = new Map();
  registerGrpcScenarioStoreIpc({ handle: (channel, handler) => handlers.set(channel, handler) });
  const result = await handlers.get("mock-scenario:read")(null, { directoryPath: root, ref });
  assert.equal(result.code, "SCENARIO_TOO_LARGE");
  assert.match(result.error, /8 MiB/);
 });
 it("legacy workspace autosave preserves v3 scenario content and metadata cache",async()=>{
  const {root,repo}=await setup();try{
   await repo.save(ref,source(),{expectedRevision:0});
   await repo.listMetadata();
   const scenarioPath=path.join(root,relativeRef(ref));
   const initial=await fs.readFile(scenarioPath,"utf8");
   await writeGitWorkspace(root, {project:{collections:[],protoLibraries:[],environments:[],mockServer:{methodFiles:{}}},layout:{},settings:{}});
   assert.equal((await fs.readFile(scenarioPath,"utf8")),initial);
   assert.equal((await repo.listMetadata()).items.length,1);
  }finally{await fs.rm(root,{recursive:true,force:true});}
 });
 it("compiles a native runtime snapshot without sending payload bodies to React and rejects stale apply",async()=>{
  const {root,repo}=await setup();try{
   await repo.save(ref,source(),{expectedRevision:0});
   const selected=await repo.read(ref);
   const snapshot=await repo.buildRuntimeSnapshot({ref,revision:selected.revision,contentHash:selected.contentHash});
   assert.equal(snapshot.scenarios.length,1);
   assert.equal(snapshot.scenarios[0].service,"tactical_display_area.TacticalDisplayAreaService");
   assert.equal(snapshot.scenarios[0].method,"RadarPlotStream");
   const handlers=new Map();
   let runtimeCalls=0;let sendCalls=0;let activeWorkspace=root;
   registerGrpcScenarioStoreIpc({handle:(key,fn)=>handlers.set(key,fn)},{
    getNativeStatus:async()=>({running:true,appliedRevision:4,workspaceDirectory:activeWorkspace}),
    sendNative:async(payload)=>{sendCalls++;assert.equal(payload.scenarioId,ref.scenarioId);
      assert.equal(payload.expectedUiRuntimeRevision,5);return {sent:1,matched:1};},
    updateNative:async(payload)=>{runtimeCalls++;assert.equal(payload.canonicalScenarioPatch.id,ref.scenarioId);
      assert.equal(payload.activeScenarioIds[ref.methodKey], ref.scenarioId);
      return {running:true,scenarioCount:1,activeScenarioIds:payload.activeScenarioIds,appliedRevision:payload.uiRuntimeRevision,configVersion:8,scenarioContentHash:"a".repeat(64)};},
   });
   const ack=await handlers.get("mock-scenario:apply-native")(null,{directoryPath:root,ref,expectedRevision:1,expectedHash:selected.contentHash});
   assert.equal(ack.ok,true);assert.equal(ack.applied.appliedRevision,5);assert.equal(runtimeCalls,1);
   const push=await handlers.get("mock-scenario:send-native")(null,{
     directoryPath:root,ref,expectedSavedRevision:1,expectedSavedHash:selected.contentHash,
     expectedRuntimeRevision:5,expectedRuntimeHash:"a".repeat(64),expectedConfigVersion:8});
   assert.equal(push.ok,true);assert.equal(sendCalls,1);
   activeWorkspace=path.join(root,"other-workspace");
   const foreign=await handlers.get("mock-scenario:apply-native")(null,{directoryPath:root,ref,expectedRevision:1,expectedHash:selected.contentHash});
   assert.equal(foreign.ok,false);assert.match(foreign.error,/NATIVE_WORKSPACE_MISMATCH/);assert.equal(runtimeCalls,1);
   const foreignSend=await handlers.get("mock-scenario:send-native")(null,{
     directoryPath:root,ref,expectedSavedRevision:1,expectedSavedHash:selected.contentHash,
     expectedRuntimeRevision:5,expectedRuntimeHash:"a".repeat(64),expectedConfigVersion:8});
   assert.equal(foreignSend.ok,false);assert.match(foreignSend.error,/NATIVE_WORKSPACE_MISMATCH/);assert.equal(sendCalls,1);
   activeWorkspace=root;
   await repo.save(ref,source("Changed"),{expectedRevision:1,expectedHash:selected.contentHash});
   const stale=await handlers.get("mock-scenario:apply-native")(null,{directoryPath:root,ref,expectedRevision:1,expectedHash:selected.contentHash});
   assert.equal(stale.ok,false);assert.equal(stale.code,"SCENARIO_CHANGED");assert.equal(runtimeCalls,1);
   const refused=await handlers.get("mock-scenario:send-native")(null,{
     directoryPath:root,ref,expectedSavedRevision:1,expectedSavedHash:selected.contentHash,
     expectedRuntimeRevision:5,expectedRuntimeHash:"a".repeat(64),expectedConfigVersion:8});
   assert.equal(refused.ok,false);assert.equal(refused.code,"SCENARIO_CHANGED");assert.equal(sendCalls,1);
  }finally{await fs.rm(root,{recursive:true,force:true});}
 });
 it("indexes a 1,000-document catalog with no hydrated body in the index",async()=>{
  const {root,repo}=await setup();try{
   for(let i=0;i<1000;i++){
    const x={methodKey:ref.methodKey,scenarioId:`scenario-${i}`};
    const file=path.join(root,relativeRef(x));await fs.mkdir(path.dirname(file),{recursive:true});
    await fs.writeFile(file,stringifyYaml({version:3,kind:"grpc-scenario",methodKey:x.methodKey,id:x.scenarioId,revision:1,scenario:{id:x.scenarioId,name:`Entry ${i}`,response:{payload:"z".repeat(2048)}}}));
   }
   const first=await repo.listMetadata();assert.equal(first.items.length,1000);
   const second=await repo.listMetadata();assert.equal(second.cached,true);
   assert.equal(JSON.stringify(second).includes("zzzz"),false);
  }finally{await fs.rm(root,{recursive:true,force:true});}
 });
});
