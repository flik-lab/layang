"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { GrpcScenarioRepository, MAX_SCENARIO_BYTES, relativeRef } = require("../lib/grpc-scenario-repository.cjs");
const { writeGitWorkspace, readGitWorkspace } = require("../lib/git-workspace.cjs");
const { stringifyYaml } = require("../lib/workspace-yaml.cjs");
const { prepareCanonicalGrpcPayload } = require("../lib/grpc-canonical-runtime.cjs");
const { loadCanonicalGrpcScenarios, readWorkspace } = require("../lib/cli-workspace.cjs");
const projectRoot = path.resolve(__dirname, "..");
const ref = { methodKey: "demo.Service/Echo", scenarioId: "primary" };
const yaml = (value, id = "primary") => `id: ${id}\nname: ${value}\nresponse:\n  data:\n    value: ${value}\n`;
const src = relative => require("node:fs").readFileSync(path.join(projectRoot,relative), "utf8");
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "layang-canonical-contract-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await writeGitWorkspace(root, { project: { collections: [], mockServer: {}, environments: [] }, layout: {}, settings: {} });
  return { root, repo: new GrpcScenarioRepository(root) };
}
const save = (repo, reference, body, revision = 0, hash = "") =>
  repo.save(reference, body, { expectedRevision: revision, expectedHash: hash });

for (const [label, stale] of [["old revision",{expectedRevision:0,expectedHash:""}],
  ["wrong hash",{expectedRevision:1,expectedHash:"bad"}]]) {
  test(`CAS rejects ${label} without altering persisted scenario`, async t => {
    const { repo }=await setup(t);
    await save(repo,ref,yaml("original"));
    const before=await repo.read(ref);
    const result=await repo.save(ref,yaml("rejected"),stale);
    assert.equal(result.ok,false);
    assert.equal((await repo.read(ref)).contentHash,before.contentHash);
  });
}

test("parallel updates to the same revision serialize; only one wins",async t=>{
  const {repo}=await setup(t);
  const first=await save(repo,ref,yaml("first"));
  const [a,b]=await Promise.all([
    save(repo,ref,yaml("second"),1,first.saved.contentHash),
    save(repo,ref,yaml("third"),1,first.saved.contentHash),
  ]);
  assert.equal([a,b].filter(result=>result.ok).length,1);
  assert.equal((await repo.read(ref)).revision,2);
});

test("stale delete cannot remove file changed by another editor",async t=>{
  const {repo}=await setup(t);
  const first=await save(repo,ref,yaml("one"));
  await save(repo,ref,yaml("two"),1,first.saved.contentHash);
  const result=await repo.remove(ref,{expectedRevision:1,expectedHash:first.saved.contentHash});
  assert.equal(result.ok,false);
  assert.equal((await repo.read(ref)).revision,2);
});

test("confirmed CAS delete removes one scenario, preserves another",async t=>{
  const {repo}=await setup(t);
  const other={...ref,scenarioId:"secondary"};
  const original=await save(repo,ref,yaml("gone"));
  await save(repo,other,yaml("retained","secondary"));
  assert.equal((await repo.remove(ref,{expectedRevision:1,expectedHash:original.saved.contentHash})).ok,true);
  await assert.rejects(repo.read(ref),{code:"ENOENT"});
  assert.deepEqual((await repo.listMetadata()).items.map(item=>item.scenarioId),["secondary"]);
});

test("recreating a deleted scenario starts a clean revision history",async t=>{
  const {repo}=await setup(t);
  const initial=await save(repo,ref,yaml("one"));
  await repo.remove(ref,{expectedRevision:1,expectedHash:initial.saved.contentHash});
  assert.equal((await save(repo,ref,yaml("two"))).saved.revision,1);
});

test("metadata listings never contain sourceText, nested payloads, or hydrated scenarios",async t=>{
  const {repo}=await setup(t);
  await save(repo,ref,'id: primary\nresponse:\n  data:\n    secret: DoNotHydrateInReact\n');
  const index=await repo.listMetadata();
  assert.equal(index.items.length,1);
  assert.equal(JSON.stringify(index).includes("DoNotHydrateInReact"),false);
  assert.equal("sourceText" in index.items[0],false);
});

test("warm index is reusable across repeated metadata-only reads",async t=>{
  const {repo}=await setup(t);
  await save(repo,ref,yaml("one"));
  assert.equal((await repo.listMetadata()).cached,false);
  assert.equal((await repo.listMetadata()).cached,true);
});

test("cache is invalidated and rebuilt after save",async t=>{
  const {repo}=await setup(t);
  const first=await save(repo,ref,yaml("one"));
  await repo.listMetadata();
  await save(repo,ref,yaml("different-value"),1,first.saved.contentHash);
  const index=await repo.listMetadata();
  assert.equal(index.items[0].revision,2);
  assert.equal(index.items[0].name,"different-value");
});

test("corrupt index never becomes the canonical source of truth",async t=>{
  const {repo}=await setup(t);
  await save(repo,ref,yaml("one"));
  await repo.listMetadata();
  await fs.writeFile(repo.indexFile,"{broken-json");
  assert.equal((await repo.listMetadata()).items[0].scenarioId,"primary");
});

test("scenario identity is enforced independent of renderer YAML",async t=>{
  const {repo}=await setup(t);
  await assert.rejects(save(repo,ref,yaml("bad","other")),/Scenario ID mismatch/);
  assert.equal((await repo.listMetadata()).items.length,0);
});

test("large scenario is rejected before any disk mutation",async t=>{
  const {repo}=await setup(t);
  const text=`id: primary\nname: big\nnotes: ${"x".repeat(MAX_SCENARIO_BYTES)}\n`;
  await assert.rejects(save(repo,ref,text),/exceeds size limit/);
  assert.equal((await repo.listMetadata()).items.length,0);
});

test("opaque file naming prevents method keys from escaping workspace",async t=>{
  const {repo,root}=await setup(t);
  const dangerous={methodKey:"../../other/service",scenarioId:"../../../escape"};
  const result=await save(repo,dangerous,yaml("ok","../../../escape"));
  assert.equal(result.ok,true);
  assert.equal((await repo.read(dangerous)).scenario.id,"../../../escape");
  const name=relativeRef(dangerous);
  assert.ok(!name.includes(".."));
  assert.ok(path.resolve(root,name).startsWith(root+path.sep));
});

test("symlinked v3 scenario file is refused",async t=>{
  const {root,repo}=await setup(t);
  const file=path.join(root,relativeRef(ref));
  await fs.mkdir(path.dirname(file),{recursive:true});
  const target=path.join(root,"external.yml");
  await fs.writeFile(target,"id: primary\n");
  try { await fs.symlink(target,file); }
  catch (error) {
    if (process.platform === "win32" && error.code === "EPERM") {
      t.skip("Windows file symlinks require Developer Mode or SeCreateSymbolicLinkPrivilege; Linux CI covers this gate.");
      return;
    }
    throw error;
  }
  await assert.rejects(repo.read(ref),error=>error.code==="UNSAFE_PATH");
});

test("runtime compiles only a chosen method on explicit method-scoped apply",async t=>{
  const {repo}=await setup(t);
  const secondary={methodKey:"demo.Service/Other",scenarioId:"other"};
  await save(repo,ref,yaml("chosen"));
  await save(repo,secondary,yaml("other","other"));
  const snapshot=await repo.buildRuntimeSnapshot({methodKey:ref.methodKey});
  assert.equal(snapshot.count,1);
  assert.equal(snapshot.scenarios[0].service,"demo.Service");
  assert.equal(snapshot.scenarios[0].method,"Echo");
});

test("method-scoped Apply refuses a selection belonging to another method",async t=>{
  const {repo}=await setup(t);
  const other={methodKey:"demo.Service/Other",scenarioId:"other"};
  await save(repo,ref,yaml("chosen"));
  const result=await save(repo,other,yaml("other","other"));
  await assert.rejects(repo.buildRuntimeSnapshot({methodKey:ref.methodKey,ref:other,revision:1,contentHash:result.saved.contentHash}),
    error=>error.code==="SCENARIO_IDENTITY_MISMATCH");
});

test("method-scoped Apply rejects stale requested saved revision",async t=>{
  const {repo}=await setup(t);
  const first=await save(repo,ref,yaml("one"));
  await save(repo,ref,yaml("two"),1,first.saved.contentHash);
  await assert.rejects(repo.buildRuntimeSnapshot({methodKey:ref.methodKey,ref,revision:1,contentHash:first.saved.contentHash}),
    error=>error.code==="SCENARIO_CHANGED");
});

test("workspace autosave cannot resurrect renderer methodFiles as an active legacy source",async t=>{
  const {root,repo}=await setup(t);
  await writeGitWorkspace(root,{project:{collections:[],mockServer:{methodFiles:{"demo.Service/Echo":{
    format:"yaml",scenarioText:'version: 1\nscenarios:\n  - id: malicious\n    service: demo.Service\n    method: Echo\n'}},scenarioText:""}},layout:{},settings:{}});
  assert.equal((await repo.listMetadata()).items.length,0);
  const files=await fs.readdir(path.join(root,"mocks","grpc","methods")).catch(e=>e.code==="ENOENT"?[]:Promise.reject(e));
  assert.equal(files.length,0);
});

test("workspace write migrates preexisting legacy file before controlled sync",async t=>{
  const {root,repo}=await setup(t);
  const old=path.join(root,"mocks","grpc","methods","stored.mock.yml");
  await fs.mkdir(path.dirname(old),{recursive:true});
  await fs.writeFile(old,stringifyYaml({version:2,kind:"grpc-mock",method:{service:"demo.Service",name:"Echo"},
    scenarios:[{id:"primary",response:{data:{old:true}}}]}));
  await writeGitWorkspace(root,{project:{collections:[],mockServer:{}},layout:{},settings:{}});
  await assert.rejects(fs.stat(old),{code:"ENOENT"});
  assert.equal((await repo.read(ref)).scenario.response.data.old,true);
});

test("source preserved if v3/legacy identity collision prevents write",async t=>{
  const {root,repo}=await setup(t);
  await save(repo,ref,yaml("modern"));
  const old=path.join(root,"mocks","grpc","methods","stored.mock.yml");
  await fs.mkdir(path.dirname(old),{recursive:true});
  const text=stringifyYaml({version:2,kind:"grpc-mock",method:{service:"demo.Service",name:"Echo"},
    scenarios:[{id:"primary",name:"different"}]});
  await fs.writeFile(old,text);
  await assert.rejects(writeGitWorkspace(root,{project:{mockServer:{},collections:[]},layout:{},settings:{}}),
    error=>error.code==="MIGRATION_CONFLICT");
  assert.equal(await fs.readFile(old,"utf8"),text);
  assert.equal((await repo.read(ref)).scenario.name,"modern");
});

test("CLI workspace load is metadata-only until a CLI command requests bodies",async t=>{
  const {root,repo}=await setup(t);
  await save(repo,ref,yaml("cli-only"));
  const state=await readWorkspace(root);
  assert.deepEqual(state.scenarios,[]);
  assert.equal((await loadCanonicalGrpcScenarios(root)).length,1);
});

test("Electron runtime rejects renderer-injected body and hash",async t=>{
  const {root,repo}=await setup(t);
  await save(repo,ref,yaml("on-disk"));
  const payload=await prepareCanonicalGrpcPayload({workspaceDirectory:root,methodFiles:{invalid:{}},
    scenarios:[{id:"tampered"}],scenarioContentHash:"tampered"});
  assert.deepEqual(payload.scenarios.map(x=>x.id),["primary"]);
  assert.equal("scenarioContentHash" in payload,false);
});

for (const [name, file, required, forbidden] of [
  ["gRPC Scenarios view is the sole editor", "app/playground/features/services/services-workspace.tsx", ["<FileBasedGrpcScenarios",'{ value: "scenarios", label: "Scenarios" }'],["function GrpcFocusedMockWorkspace","<GrpcFocusedMockWorkspace"]],
  ["Request tab navigates to editor instead of writing methodFiles", "app/playground/features/shell/workbench-main-panel.tsx", ["Open Scenarios","openActiveRequestMockWorkspace"],["parseMockScenarioText","saveMockScenarioForMethod"]],
  ["Proto browser does not parse method bodies", "app/playground/features/services/services-workspace.tsx", ["const unsupportedReason"],["getMockMethodScenarioFile","parseMockScenarioText"]],
  ["Scenario editor reads only selected body", "app/playground/features/mock-server/workspace/FileBasedGrpcScenarios.tsx", ["useScenarioIndex(directoryPath)","store.read(directoryPath, ref)","store.delete(directoryPath, current, revision, contentHash)"],["MockCatalogPanel","store.list(directoryPath)"]],
  ["Standalone Apply and Manual Send require revision acknowledgment", "app/playground/features/mock-server/workspace/FileBasedGrpcScenarios.tsx", ["store.applyNative(","store?.sendNative(","store.applySendGateway("],["GrpcFocusedMockWorkspace"]],
  ["shell does not parse entire mock file catalog", "app/playground/features/shell/use-workbench-container-model.tsx", ["const parsedMockConfig = useMemo(","bundle: { version: 1 as const, scenarios: [] }"],["() => parseAllMockScenarioFiles(mockServer"]],
]) {
  test(name, () => {
    const text=src(file);
    for (const fragment of required) assert.ok(text.includes(fragment),`Missing expected contract: ${fragment}`);
    for (const fragment of forbidden) assert.ok(!text.includes(fragment),`Legacy contract still active: ${fragment}`);
  });
}
