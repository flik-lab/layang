"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { fingerprintGatewayScenarios, verifyGatewaySendRevision } = require("../lib/gateway-version-contract.cjs");
const { createGrpcMockLivePushRegistry, selectGrpcMockManualResponses } = require("../lib/grpc-mock-live-push.cjs");
const { executionAllows } = require("../lib/mock-execution-engine.cjs");

function standbyScenario(id, version) {
  return { id, service: "demo.Service", method: "Stream", active: true,
    stream: { execution: { mode: "standby" }, responses: [{ data: { version } }] } };
}

function testGateway(extraScenarios = []) {
  const source = fs.readFileSync("electron/services/grpc-gateway-server.cjs", "utf8");
  const start = source.indexOf("function requireGateway(profileId) {");
  const end = source.indexOf("function getGatewayProfileStatus(profileId) {", start);
  assert.ok(start > 0 && end > start, "Extract executable Gateway Apply/Send implementation");
  const old = standbyScenario("standby", "old");
  const initialScenarios = [old, ...extraScenarios];
  const registry = createGrpcMockLivePushRegistry();
  const runtime = {
    id: "g", scenarios: initialScenarios, configVersion: 1, appliedRevision: 0,
    scenarioContentHash: fingerprintGatewayScenarios(initialScenarios), manualRegistry: registry,
    activeScenarioIds: {}, profile: { mode: "mock", methodBehaviors: {} },
    metrics: { streamMessages: 0, bytesOut: 0 },
  };
  const runtimes = new Map([["g", runtime]]);
  const queues = new Map();
  const context = vm.createContext({
    gatewayRuntimes: runtimes,
    queueGatewayLifecycle(id, operation) {
      const last = queues.get(id) || Promise.resolve();
      const next = last.then(operation, operation);
      queues.set(id, next.catch(() => {}));
      return next;
    },
    gatewayStatus: (r) => ({ running: true, appliedRevision:r.appliedRevision,
      configVersion:r.configVersion, scenarioContentHash:r.scenarioContentHash }),
    fingerprintGatewayScenarios, verifyGatewaySendRevision, executionAllows,
    resolveBehavior: () => "mock",
    selectGrpcMockManualResponses,
    normalizeGrpcStatus: () => 0,
    grpc: { status: { OK: 0 } },
    estimateBytes: (value) => Buffer.byteLength(JSON.stringify(value ?? null)),
    Number, String, Array, Object, Error,
  });
  vm.runInContext(source.slice(start, end) +
    "\nthis.gateway = {applyGatewayRuntimeSnapshot,applyAndSendGatewaySnapshot,sendGatewayStreamMessage};", context);
  return { runtime, registry, api: context.gateway };
}

test("Gateway fingerprint validates bounded immutable snapshot before publication", () => {
  const first = standbyScenario("s", "A");
  const second = standbyScenario("s", "B");
  assert.notEqual(fingerprintGatewayScenarios([first]), fingerprintGatewayScenarios([second]));
  assert.throws(() => fingerprintGatewayScenarios([{ id:"bad" }]), /identity/);
  assert.throws(() => fingerprintGatewayScenarios([{
    ...first, stream:{ responses:[{ data:"x".repeat(33 * 1024 * 1024) }] },
  }]), /budget/);
  assert.throws(() => verifyGatewaySendRevision({ appliedRevision:2, configVersion:3,
    scenarioContentHash:fingerprintGatewayScenarios([first]) }, {
      expectedRuntimeRevision:1,expectedConfigVersion:3,
      expectedRuntimeHash:fingerprintGatewayScenarios([first]),
    }), /STALE_GATEWAY_SNAPSHOT/);
});

test("Gateway Apply+Manual Send is versioned, atomic across queues and targets only selected Standby sessions", async () => {
  const { runtime, registry, api } = testGateway();
  const a = new EventEmitter(); const b = new EventEmitter();
  const writesA=[];const writesB=[];
  a.write = (value) => { writesA.push(value);return true; };
  b.write = (value) => { writesB.push(value);return true; };
  registry.register({call:a,serviceName:"demo.Service",methodName:"Stream",scenarioId:"standby"});
  registry.register({call:b,serviceName:"demo.Service",methodName:"Stream",scenarioId:"other"});
  const next = standbyScenario("standby", "new");
  const applied = await api.applyGatewayRuntimeSnapshot({ profileId:"g", scenarios:[next],
    expectedConfigVersion:1, uiRuntimeRevision:1 });
  assert.equal(applied.appliedRevision, 1);
  assert.equal(applied.configVersion, 2);
  assert.notEqual(runtime.scenarioContentHash, fingerprintGatewayScenarios([standbyScenario("standby","old")]));
  const version = {
    profileId:"g",serviceName:"demo.Service",methodName:"Stream",scenarioId:"standby",
    expectedRuntimeRevision:1,expectedConfigVersion:2,expectedRuntimeHash:applied.scenarioContentHash,
  };
  const sent = await api.sendGatewayStreamMessage(version);
  assert.equal(sent.sent,1);
  assert.deepEqual(writesA, [{version:"new"}]);
  assert.deepEqual(writesB, []);
  await assert.rejects(api.sendGatewayStreamMessage({...version,expectedRuntimeRevision:0}), /STALE_GATEWAY_SNAPSHOT/);
  await assert.rejects(api.applyGatewayRuntimeSnapshot({profileId:"g",scenarios:[standbyScenario("standby","bad")],
    expectedConfigVersion:1,uiRuntimeRevision:2}), /STALE_GATEWAY_CONFIG/);
  const latest = standbyScenario("standby","latest");
  const atomic = await api.applyAndSendGatewaySnapshot({
    profileId:"g",scenarios:[latest],expectedConfigVersion:2,uiRuntimeRevision:2,
    serviceName:"demo.Service",methodName:"Stream",scenarioId:"standby",
  });
  assert.equal(atomic.applied.configVersion,3);
  assert.equal(atomic.delivery.sent,1);
  assert.deepEqual(writesA, [{version:"new"},{version:"latest"}]);
  await assert.rejects(api.sendGatewayStreamMessage(version), /STALE_GATEWAY_SNAPSHOT/);
  assert.equal(runtime.configVersion,3);
  assert.equal(runtime.activeScenarioIds["demo.Service/Stream"], "standby");
  await assert.rejects(api.applyAndSendGatewaySnapshot({ profileId:"g",scenarios:[latest],
    expectedConfigVersion:3,uiRuntimeRevision:3,
    serviceName:"demo.Service",methodName:"Stream",scenarioId:"absent",
  }), /No active, manual-enabled/);
  assert.equal(runtime.configVersion,3, "invalid atomic send must not apply a new snapshot");
  await assert.rejects(api.applyGatewayRuntimeSnapshot({profileId:"g",scenarios:[{id:"broken"}],
    expectedConfigVersion:3,uiRuntimeRevision:3}), /identity/);
  assert.equal(runtime.configVersion,3, "invalid apply must not mutate the active runtime");
  registry.clear();
  assert.equal(a.listenerCount("drain"),0);
  assert.equal(b.listenerCount("close"),0);
});

test("method-scoped Apply retains unrelated Gateway methods without recompilation", async () => {
  const other = { ...standbyScenario("other", "preserved"),
    service: "other.Service", method: "Events" };
  const { runtime, api } = testGateway([other]);
  const selected = standbyScenario("standby", "patched");
  const result = await api.applyGatewayRuntimeSnapshot({
    profileId: "g", scenarios: [selected], patchMethodKey: "demo.Service/Stream",
    serviceName: "demo.Service", methodName: "Stream", scenarioId: "standby",
    expectedConfigVersion: 1, uiRuntimeRevision: 1,
  });
  assert.equal(result.methodScenarioCount, 1);
  assert.equal(result.scenarioCount, 2);
  assert.equal(runtime.scenarios.find(x => x.service === "other.Service"), other);
  assert.equal(runtime.scenarios.find(x => x.service === "demo.Service").stream.responses[0].data.version,"patched");
  const oldHash = runtime.scenarioContentHash;
  await assert.rejects(api.applyGatewayRuntimeSnapshot({
    profileId:"g",scenarios:[{...selected,method:"Events"}],patchMethodKey:"demo.Service/Stream",
    expectedConfigVersion:2,uiRuntimeRevision:2,
  }), /unrelated scenario/);
  assert.equal(runtime.scenarioContentHash,oldHash);
  assert.equal(runtime.configVersion,2);
});

test("Gateway backpressure stops subsequent Manual Send until drain, never accumulates a queue", async () => {
  const {registry, api} = testGateway();
  const call = new EventEmitter(); const received=[];
  call.write = (payload) => { received.push(payload); return false; };
  registry.register({call,serviceName:"demo.Service",methodName:"Stream",scenarioId:"standby"});
  const scenario=standbyScenario("standby","one");
  const applied = await api.applyGatewayRuntimeSnapshot({
    profileId:"g",scenarios:[scenario],expectedConfigVersion:1,uiRuntimeRevision:1,
  });
  const opts={ profileId:"g",serviceName:"demo.Service",methodName:"Stream",scenarioId:"standby",
    expectedConfigVersion:2,expectedRuntimeRevision:1,expectedRuntimeHash:applied.scenarioContentHash };
  assert.equal((await api.sendGatewayStreamMessage(opts)).backpressured,1);
  for(let i=0;i<1000;i++) assert.equal((await api.sendGatewayStreamMessage(opts)).sent,0);
  assert.equal(received.length,1);
  call.emit("drain");
  assert.equal((await api.sendGatewayStreamMessage(opts)).sent,1);
  assert.equal(received.length,2);
  call.emit("cancelled");
  assert.equal(registry.count(),0);
});

test("Gateway native and file-backed routes are connected through typed IPC, not arbitrary renderer snapshots", () => {
  const sources = ["electron/main.cjs", "electron/preload.cjs", "electron/ipc/grpc-scenario-store-ipc.cjs",
    "types/electron.d.ts", "app/playground/features/mock-server/workspace/FileBasedGrpcScenarios.tsx"]
    .map(name=>fs.readFileSync(name,"utf8"));
  assert.match(sources[0], /applyAndSendGatewaySnapshot/);
  assert.match(sources[1], /mock-scenario:apply-send-gateway/);
  assert.match(sources[2], /repo\.buildRuntimeSnapshot/);
  assert.match(sources[3], /applySendGateway:/);
  assert.match(sources[4], /Activate and send via Web Access/);
});

test("file-backed Gateway IPC applies only current saved revisions from its own workspace", async () => {
  const fsP = require("node:fs/promises");
  const os = require("node:os");
  const path = require("node:path");
  const { writeGitWorkspace } = require("../lib/git-workspace.cjs");
  const { GrpcScenarioRepository } = require("../lib/grpc-scenario-repository.cjs");
  const { registerGrpcScenarioStoreIpc } = require("../electron/ipc/grpc-scenario-store-ipc.cjs");
  const root = await fsP.mkdtemp(path.join(os.tmpdir(), "layang-gateway-atomic-"));
  // Scenario store IPC only serves folders the user granted access to.
  require("../electron/utils/workspace-access.cjs").getWorkspaceAccess().addRoot(root);
  try {
    await writeGitWorkspace(root, {project:{collections:[],protoLibraries:[],environments:[],mockServer:{methodFiles:{}}},layout:{},settings:{}});
    const ref = { methodKey:"demo.Service/Stream",scenarioId:"standby" };
    const repo = new GrpcScenarioRepository(root);
    const source = `id: standby\nname: Standby\nstream:\n  execution:\n    mode: standby\n  responses:\n    - data:\n        version: one\n`;
    assert.equal((await repo.save(ref, source, {expectedRevision:0,expectedHash:""})).ok,true);
    const saved = await repo.read(ref);
    const handlers = new Map();
    let active = {running:true,workspaceDirectory:root,configVersion:1,appliedRevision:0};
    let appliedCount=0, sendCount=0, atomicCount=0;
    registerGrpcScenarioStoreIpc({handle:(channel,callback)=>handlers.set(channel,callback)}, {
      getGatewayStatus:()=>active,
      applyGateway:async (p)=>{
        appliedCount++;
        assert.equal(p.serviceName, "demo.Service");
        assert.equal(p.methodName, "Stream");
        assert.equal(p.scenarioId, "standby");
        assert.equal(p.scenarios[0].stream.responses[0].data.version,"one");
        active = {...active,configVersion:2,appliedRevision:1};
        return {...active,scenarioCount:1,methodScenarioCount:1,scenarioContentHash:fingerprintGatewayScenarios(p.scenarios)};
      },
      sendGateway:async (p)=>{
        sendCount++;
        assert.equal(p.expectedRuntimeRevision,1);
        assert.equal(p.expectedConfigVersion,2);
        return {sent:1,matched:1};
      },
      applySendGateway:async (p)=>{
        atomicCount++;
        assert.equal(p.scenarioId,"standby");
        return {applied:{appliedRevision:2,configVersion:3,
          scenarioContentHash:fingerprintGatewayScenarios(p.scenarios)}, delivery:{sent:1,matched:1}};
      },
    });
    const base={directoryPath:root,profileId:"g",ref,expectedRevision:saved.revision,expectedHash:saved.contentHash};
    const applied=await handlers.get("mock-scenario:apply-gateway")(null,base);
    assert.equal(applied.ok,true);assert.equal(applied.applied.configVersion,2);
    assert.equal(appliedCount,1);
    const pushed=await handlers.get("mock-scenario:send-gateway")(null,{
      ...base,expectedSavedRevision:1,expectedSavedHash:saved.contentHash,
      expectedRuntimeRevision:1,expectedRuntimeHash:applied.applied.scenarioContentHash,expectedConfigVersion:2,
    });
    assert.equal(pushed.ok,true);assert.equal(sendCount,1);
    const atomic=await handlers.get("mock-scenario:apply-send-gateway")(null,base);
    assert.equal(atomic.ok,true);assert.equal(atomicCount,1);
    active.workspaceDirectory = `${root}-unrelated`;
    const mismatch=await handlers.get("mock-scenario:apply-gateway")(null,base);
    assert.equal(mismatch.ok,false);
    assert.match(mismatch.error,/GATEWAY_WORKSPACE_MISMATCH/);
    assert.equal(appliedCount,1);
    active.workspaceDirectory=root;
    await repo.save(ref,source.replace("one","two"),{expectedRevision:1,expectedHash:saved.contentHash});
    const stale=await handlers.get("mock-scenario:apply-gateway")(null,base);
    assert.equal(stale.ok,false);assert.match(stale.error,/SCENARIO_CHANGED/);
    const staleSend=await handlers.get("mock-scenario:send-gateway")(null,{
      ...base,expectedSavedRevision:1,expectedSavedHash:saved.contentHash,
      expectedRuntimeRevision:1,expectedRuntimeHash:applied.applied.scenarioContentHash,expectedConfigVersion:2,
    });
    assert.equal(staleSend.ok,false);assert.equal(sendCount,1);
  } finally {
    await fsP.rm(root,{recursive:true,force:true});
  }
});
