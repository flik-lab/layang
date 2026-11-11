"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { parseYaml, stringifyYaml } = require("../lib/workspace-yaml.cjs");
const { writeGitWorkspace } = require("../lib/git-workspace.cjs");
const { GrpcScenarioRepository } = require("../lib/grpc-scenario-repository.cjs");

test("Standby YAML nested data survives parsing and serialization", () => {
  const yaml = `id: standby\nstream:\n  execution:\n    mode: standby\n  responses:\n    - data:\n        version: one\n        nested:\n          count: 12\n      code: OK\n    - data:\n        version: two\n      delayMs: 40\n`;
  const doc = parseYaml(yaml);
  assert.equal(doc.stream.responses[0].data.version, "one");
  assert.equal(doc.stream.responses[0].data.nested.count, 12);
  assert.equal(doc.stream.responses[0].code, "OK");
  assert.equal(doc.stream.responses[1].data.version, "two");
  assert.deepEqual(parseYaml(stringifyYaml(doc)), doc);
});

test("v3 method-scoped compilation reads only its method's scenario bodies", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),"layang-v3-method-snapshot-"));
  try {
    await writeGitWorkspace(root, {project:{collections:[],protoLibraries:[],environments:[],mockServer:{methodFiles:{}}},layout:{},settings:{}});
    const repo = new GrpcScenarioRepository(root);
    const a={methodKey:"a.Service/Stream",scenarioId:"a1"};
    const b={methodKey:"b.Service/Stream",scenarioId:"b1"};
    await repo.save(a,"id: a1\nstream:\n  execution:\n    mode: standby\n  responses:\n    - data:\n        id: a1\n",{expectedRevision:0,expectedHash:""});
    await repo.save(b,"id: b1\nstream:\n  execution:\n    mode: standby\n  responses:\n    - data:\n        id: b1\n",{expectedRevision:0,expectedHash:""});
    const selected=await repo.read(a);
    await repo.listMetadata(); // warm metadata-only index
    const original=repo.read.bind(repo);
    const hydrated=[];
    repo.read=async ref=>{hydrated.push(ref.methodKey);return original(ref);};
    const snapshot=await repo.buildRuntimeSnapshot({methodKey:a.methodKey,ref:a,
      revision:selected.revision,contentHash:selected.contentHash});
    assert.equal(snapshot.methodKey,a.methodKey);
    assert.equal(snapshot.count,1);
    assert.deepEqual(hydrated,[a.methodKey]);
    assert.equal(snapshot.scenarios[0].stream.responses[0].data.id,"a1");
    await assert.rejects(repo.buildRuntimeSnapshot({methodKey:a.methodKey,ref:b,
      revision:1,contentHash:"bad"}),/unrelated scenario|not saved/);
    const full=await repo.buildRuntimeSnapshot();
    assert.equal(full.count,2,"legacy full compilation remains supported");
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

test("renderer Gateway capture API cannot choose an arbitrary write destination", async () => {
  const ipc=await fs.readFile(path.join(__dirname,"../electron/ipc/grpc-gateway-ipc.cjs"),"utf8");
  const service=await fs.readFile(path.join(__dirname,"../electron/services/grpc-gateway-server.cjs"),"utf8");
  assert.doesNotMatch(ipc,/payload\?\.destination/);
  const start=service.indexOf("async function saveGatewayCaptureAsScenario");
  const end=service.indexOf("async function readCaptureFromDisk",start);
  assert.ok(start>=0 && end>start);
  assert.doesNotMatch(service.slice(start,end),/writeFile\(|path\.resolve\(destination\)/);
});
