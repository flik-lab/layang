"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { createMockScenarioWorkload } = require("./fixtures/pr00-mock-workload.cjs");
const { computeMockScenarioContentHash, assertManualSendRevision } = require("../lib/grpc-mock-scenario-revision.cjs");
const { createGrpcMockLivePushRegistry, selectGrpcMockManualResponses } = require("../lib/grpc-mock-live-push.cjs");
const { executionAllows } = require("../lib/mock-execution-engine.cjs");
const { isStaleUiRuntimeUpdate, markUiRuntimeUpdate } = require("../lib/grpc-mock-runtime-guard.cjs");
const { loadTypeScriptModule } = require("./helpers/load-typescript-module.cjs");
const { parseOptions } = require("../scripts/benchmarks/mock-baseline.cjs");

const read = (name) => fs.readFileSync(path.resolve(__dirname, "..", name), "utf8");

test("PR-00 generator is repeatable and its bodies are parseable", () => {
  const a = createMockScenarioWorkload({ scenarioCount: 25, payloadKb: 1, seed: 72 });
  const b = createMockScenarioWorkload({ scenarioCount: 25, payloadKb: 1, seed: 72 });
  const c = createMockScenarioWorkload({ scenarioCount: 25, payloadKb: 1, seed: 73 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.methodFiles, c.methodFiles);
  assert.equal(Object.values(a.methodFiles).reduce((total, file) => total + JSON.parse(file.scenarioText).scenarios.length, 0), 25);
  assert.throws(() => createMockScenarioWorkload({ scenarioCount: 10000, payloadKb: 100 }), /128 MiB/);
  assert.throws(() => parseOptions(["--samples", "1"]), /samples/);
});

test("PR-01 SHA-256 detects identical-length text edits and is key-order independent", async () => {
  const a = {
    "bench.Service/A": { format: "json", scenarioText: "aaaa", updatedAt: "2026-01-01" },
    "bench.Service/B": { format: "yaml", scenarioText: "cccc", updatedAt: "2026-01-01" },
  };
  const reordered = { "bench.Service/B": a["bench.Service/B"], "bench.Service/A": a["bench.Service/A"] };
  const edited = { ...a, "bench.Service/A": { ...a["bench.Service/A"], scenarioText: "bbbb" } };
  const first = computeMockScenarioContentHash(a);
  const second = computeMockScenarioContentHash(reordered);
  const changed = computeMockScenarioContentHash(edited);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, second);
  assert.notEqual(first, changed);
  assert.equal(a["bench.Service/A"].scenarioText.length, edited["bench.Service/A"].scenarioText.length);
  const browser = loadTypeScriptModule("app/playground/features/mock-server/mock-scenario-revision.ts");
  assert.equal(await browser.computeMockScenarioContentHash(edited), changed);
});

test("PR-01 UI SHA-256 invalidates cached digest when a mutable file body changes", async () => {
  const browser = loadTypeScriptModule("app/playground/features/mock-server/mock-scenario-revision.ts");
  const methodFiles = { "svc/Method": { format: "json", scenarioText: "BBBB" } };
  const before = await browser.computeMockScenarioContentHash(methodFiles);
  methodFiles["svc/Method"].scenarioText = "CCCC";
  const after = await browser.computeMockScenarioContentHash(methodFiles);
  assert.notEqual(before, after);
  assert.equal(after, computeMockScenarioContentHash(methodFiles));
});

test("PR-01 revision guard rejects stale, invalid-hash, and changed-config manual sends", () => {
  const hash = computeMockScenarioContentHash({ "svc/m": { format: "json", scenarioText: "latest" } });
  const runtime = { lastUiRuntimeRevision: 13, scenarioContentHash: hash, runtime: { configVersion: 6 } };
  const expected = { expectedUiRuntimeRevision: 13, expectedScenarioContentHash: hash, expectedConfigVersion: 6 };
  assert.doesNotThrow(() => assertManualSendRevision(runtime, expected));
  assert.throws(() => assertManualSendRevision(runtime, { ...expected, expectedUiRuntimeRevision: 12 }), /revision mismatch/);
  assert.throws(() => assertManualSendRevision(runtime, { ...expected, expectedScenarioContentHash: "a".repeat(64) }), /hash mismatch/);
  assert.throws(() => assertManualSendRevision(runtime, { ...expected, expectedConfigVersion: 5 }), /configuration changed/);
  assert.throws(() => assertManualSendRevision(runtime, { expectedUiRuntimeRevision: 13 }), /hash mismatch/);
  assert.doesNotThrow(() => assertManualSendRevision(runtime, {})); // explicit backward compatibility for CLI
});

test("PR-01 newer UI revision supersedes old updates (including same-timestamp edits)", () => {
  const active = { lastUiRuntimeRevision: 2, lastUiRuntimeUpdateAt: Date.now() };
  const newer = { uiRuntimeRevision: 4, mockServerUpdatedAt: "2026-01-01T00:00:00Z" };
  markUiRuntimeUpdate(active, newer);
  assert.equal(active.lastUiRuntimeRevision, 4);
  assert.equal(isStaleUiRuntimeUpdate(active, { ...newer, uiRuntimeRevision: 3 }), true);
  assert.equal(isStaleUiRuntimeUpdate(active, { ...newer, uiRuntimeRevision: 5 }), false);
});

/** Load the real synchronous Manual Send body, without depending on Electron/grpc binaries. */
function createManualSendTestRuntime() {
  const source = read("electron/services/grpc-mock-server.cjs");
  const start = source.indexOf("function getMockLivePushStatus(runtime) {");
  const end = source.indexOf("function getMockServerStatus() {", start);
  assert.ok(start > 0 && end > start, "Manual Send source region must be extractable");
  const stream = [];
  const livePushRegistry = createGrpcMockLivePushRegistry();
  livePushRegistry.register({
    serviceName: "bench.Service", methodName: "Live", scenarioId: "scenario-1",
    call: { write: (value) => { stream.push(value); return true; } },
  });
  const hash = computeMockScenarioContentHash({ "bench.Service/Live": { scenarioText: "BBBB", format: "json" } });
  const runtime = {
    lastUiRuntimeRevision: 8,
    scenarioContentHash: hash,
    runtime: {
      configVersion: 2,
      livePushRegistry,
      scenariosByMethod: new Map([["bench.Service/Live", [{
        id: "scenario-1", service: "bench.Service", method: "Live",
        stream: { execution: { mode: "standby", manual: true }, responses: [{ data: { version: "B" } }] },
      }]]]),
    },
  };
  const context = vm.createContext({
    activeMockServer: runtime, assertManualSendRevision,
    getRuntimeMethodKey: (service, method) => `${service}/${method}`,
    selectGrpcMockManualResponses, executionAllows,
    normalizeGrpcStatus: () => 0, grpc: { status: { OK: 0 } },
    Math, Number, String, Array, Object,
  });
  vm.runInContext(`${source.slice(start, end)}\nthis.send = sendMockServerStreamMessage;`, context);
  return { send: context.send, stream, runtime };
}

test("PR-01 real Manual Send does not write stale payloads and delivers the confirmed revision", () => {
  const { send, stream, runtime } = createManualSendTestRuntime();
  const options = {
    serviceName: "bench.Service", methodName: "Live", scenarioId: "scenario-1",
    expectedUiRuntimeRevision: 8, expectedScenarioContentHash: runtime.scenarioContentHash,
    expectedConfigVersion: 2, responseIndex: 0,
  };
  assert.throws(() => send({ ...options, expectedUiRuntimeRevision: 7 }), /revision mismatch/);
  assert.equal(stream.length, 0);
  assert.throws(() => send({ ...options, expectedConfigVersion: 1 }), /configuration changed/);
  assert.equal(stream.length, 0);
  const result = send(options);
  assert.equal(result.sent, 1);
  assert.equal(result.appliedRevision, 8);
  assert.equal(result.configVersion, 2);
  assert.equal(result.scenarioId, "scenario-1");
  assert.equal(stream.length, 1);
  assert.equal(stream[0].version, "B");
});

test("canonical v3 Manual Send applies revision/hash checks inside IPC and utility runtime", () => {
  const editor = read("app/playground/features/mock-server/workspace/FileBasedGrpcScenarios.tsx");
  const ipc = read("electron/ipc/grpc-scenario-store-ipc.cjs");
  const native = read("electron/services/grpc-mock-server.cjs");
  const utility = read("lib/runtime/mock/mock-runtime.cjs");
  const services = read("app/playground/features/services/services-workspace.tsx");
  assert.match(services, /<FileBasedGrpcScenarios/);
  assert.match(editor, /store\.applyNative\(/);
  assert.match(editor, /store\?\.sendNative\(/);
  assert.match(ipc, /mock-scenario:apply-native/);
  assert.match(ipc, /mock-scenario:send-native/);
  assert.match(ipc, /SCENARIO_CHANGED/);
  assert.match(native, /assertManualSendRevision\(activeMockServer, payload\)/);
  assert.match(native, /queueMockServerLifecycle\(\(\) => updateActiveMockServerNow\(payload, source\)\)/);
  assert.match(utility, /Number\(payload\?\.uiRuntimeRevision\) > 0 \? "ui" : "utility"/);
});
