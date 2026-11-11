"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { createRequire } = require("node:module");
const requireFromRoot = createRequire(path.resolve(__dirname, "..", "..", "package.json"));
let grpc, loader;
try { grpc = requireFromRoot("@grpc/grpc-js"); loader = requireFromRoot("@grpc/proto-loader"); } catch {}
if (process.env.LAYANG_REQUIRE_RUNTIME_DEPS === "1" && (!grpc || !loader))
  throw new Error("Real gRPC E2E requires installed @grpc/grpc-js and @grpc/proto-loader");

const protoText = `syntax = "proto3";
package demo;
import "common.proto";
import "./reply.proto";
service Greeter { rpc SayHello (HelloRequest) returns (HelloReply); }
`;
const commonText = `syntax = "proto3";
package demo;
message HelloRequest { string name = 1; }`;
const replyText = `syntax = "proto3";
package demo;
import "./common.proto";
message HelloReply { string message = 1; }`;
const key = "demo.Greeter/SayHello";
const ref = { methodKey: key, scenarioId: "disk-1" };
async function freePort() {
  return new Promise((resolve,reject) => {
    const server = net.createServer();
    server.once("error",reject);
    server.listen(0,"127.0.0.1",() => { const port=server.address().port; server.close(() => resolve(port)); });
  });
}

test("real gRPC runtime serves v3 disk snapshots and rejects renderer legacy payloads", {
  skip: !grpc || !loader,
  timeout: 25_000,
}, async t => {
  const { writeGitWorkspace } = require("../../lib/git-workspace.cjs");
  const { GrpcScenarioRepository } = require("../../lib/grpc-scenario-repository.cjs");
  const { prepareCanonicalGrpcPayload } = require("../../lib/grpc-canonical-runtime.cjs");
  const { startMockServer, updateActiveMockServer, stopMockServer } = require("../../electron/services/grpc-mock-server.cjs");
  const root = await fs.mkdtemp(path.join(os.tmpdir(),"layang-canonical-e2e-"));
  const protoPath = path.join(root,"greeter.proto");
  let client;
  t.after(async () => { client?.close(); await stopMockServer(); await fs.rm(root,{recursive:true,force:true}); });
  await writeGitWorkspace(root,{project:{collections:[],mockServer:{},environments:[]},layout:{},settings:{}});
  await fs.writeFile(protoPath,protoText);
  await fs.writeFile(path.join(root, "common.proto"), commonText);
  await fs.writeFile(path.join(root, "reply.proto"), replyText);
  const repo = new GrpcScenarioRepository(root);
  const saved = await repo.save(ref, 'id: disk-1\nname: Disk only\nresponse:\n  data:\n    message: saved-v3\n',
    { expectedRevision:0,expectedHash:"" });
  assert.equal(saved.ok,true);
  const port = await freePort();
  const input = { port, bindHost:"127.0.0.1",workspaceDirectory:root,
    protoFiles:[{name:"proto/greeter.proto",text:protoText}, {name:"proto/common.proto",text:commonText},
      {name:"proto/reply.proto",text:replyText}],
    methods:[{ serviceName:"demo.Greeter",methodName:"SayHello", requestStream:false,responseStream:false,
      requestType:"demo.HelloRequest",responseType:"demo.HelloReply" }],
    activeScenarioIds:{ [key]:"disk-1" }, enabledMethods:{[key]:true},
    // Both are untrusted legacy ingress; neither may override the v3 repository.
    scenarios:[{id:"injected",service:"demo.Greeter",method:"SayHello",response:{data:{message:"INJECTED"}}}],
    methodFiles:{[key]:{format:"json",scenarioText:"{\"scenarios\":[{\"id\":\"INJECTED\"}]}"}},
    scenarioContentHash:"renderer-forged-hash",
    canonicalScenarioPatch:{id:"injected",service:"demo.Greeter",method:"SayHello"},
  };
  const runtimePayload = await prepareCanonicalGrpcPayload(input);
  assert.deepEqual(runtimePayload.scenarios.map(s => s.id),["disk-1"]);
  assert.equal("methodFiles" in runtimePayload,false);
  assert.equal("scenarioContentHash" in runtimePayload,false);
  assert.equal("canonicalScenarioPatch" in runtimePayload,false);
  await startMockServer(runtimePayload);
  const definition=loader.loadSync(protoPath,{keepCase:false,longs:String,enums:String,defaults:true});
  client=new (grpc.loadPackageDefinition(definition).demo.Greeter)(`127.0.0.1:${port}`,grpc.credentials.createInsecure());
  const call = () => new Promise((resolve,reject) =>
    client.sayHello({name:"C"},(error,response) => error ? reject(error) : resolve(response.message)));
  assert.equal(await call(),"saved-v3");
  await assert.rejects(updateActiveMockServer({
    expectedWorkspaceDirectory: path.join(root, "other-workspace"), scenarios: [],
  }, "ui"), /NATIVE_WORKSPACE_MISMATCH/);
  assert.equal(await call(),"saved-v3", "foreign workspace must not replace the active snapshot");
  const current=await repo.read(ref);
  await repo.save(ref,'id: disk-1\nname: Disk updated\nresponse:\n  data:\n    message: new-v3\n',
    {expectedRevision:current.revision,expectedHash:current.contentHash});
  const updated=await prepareCanonicalGrpcPayload(input);
  await updateActiveMockServer(updated,"ui");
  assert.equal(await call(),"new-v3");

  const scenarioFile = await repo.fileFor(ref);
  const document = await repo.read(ref);
  await fs.writeFile(scenarioFile, "invalid: [");
  await assert.rejects(prepareCanonicalGrpcPayload(input));
  assert.equal(await call(), "new-v3", "a bad external edit must leave the running snapshot intact");

  const largeMessage = "x".repeat(768 * 1024);
  const { stringifyYaml } = require("../../lib/workspace-yaml.cjs");
  await fs.writeFile(scenarioFile, stringifyYaml({
    version: 3, kind: "grpc-scenario", methodKey: key, id: ref.scenarioId,
    revision: document.revision,
    scenario: { id: ref.scenarioId, response: { data: { message: largeMessage } } },
  }));
  assert.equal(await call(), "new-v3", "saving YAML does not activate it");
  await updateActiveMockServer(await prepareCanonicalGrpcPayload(input), "ui");
  const reply = await call();
  assert.equal(reply.length, largeMessage.length);
  assert.ok(reply === largeMessage, "the existing client receives the full new response after Apply");
});
