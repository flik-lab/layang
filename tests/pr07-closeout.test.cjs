"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { EventEmitter } = require("node:events");
const { createGrpcMockDrainGate } = require("../lib/grpc-mock-drain-gate.cjs");
const { createBoundedGatewayLog } = require("../lib/bounded-gateway-log.cjs");

const root = path.resolve(__dirname, "..");

test("weighted scenario cache evicts LRU, invalidates same-length edits, and bounds retention", async () => {
  const { createBoundedRevisionCache } = await import("../lib/bounded-revision-cache.mjs");
  const cache = createBoundedRevisionCache({ maxEntries: 2, maxWeight: 20 });
  cache.set("A", "1234", { n: 1 }, 8);
  cache.set("B", "1234", { n: 2 }, 8);
  assert.equal(cache.get("A", "1234").n, 1); // promote
  cache.set("C", "zzzz", { n: 3 }, 8);
  assert.equal(cache.get("B", "1234"), undefined);
  assert.equal(cache.get("A", "xxxx"), undefined); // identical length, new contents
  assert.equal(cache.get("C", "zzzz").n, 3);
  cache.set("large", "1", {}, 1000); // should not be cached
  assert.equal(cache.get("large", "1"), undefined);
  cache.clear();
  assert.deepEqual(cache.stats, { entries: 0, estimatedWeight: 0 });
});

test("gateway log memory is bounded and large response fields are truncated", () => {
  const history = createBoundedGatewayLog({ maxEntries: 3, maxBytes: 2048, maxFieldBytes: 100 });
  for (let i = 0; i < 10000; i++) history.add({ id: i, request: { payload: "x".repeat(1000) }, response: { n: i } });
  assert.ok(history.entries.length <= 3);
  assert.ok(history.retainedBytes <= 2048);
  assert.equal(history.entries.at(-1)?.request?.truncated, true);
  history.clear();
  assert.equal(history.entries.length, 0);
  assert.equal(history.retainedBytes, 0);
});

test("scheduled and periodic writers share one drain subscription and cleanup", () => {
  const call = new EventEmitter();
  const gate = createGrpcMockDrainGate(call);
  const actions = [];
  assert.equal(gate.afterWrite(false, "scheduled", () => actions.push("scheduled")), true);
  for (let i = 0; i < 10000; i++) assert.equal(gate.waitIfBlocked("periodic", () => actions.push("periodic")), true);
  assert.equal(gate.pendingCount, 2);
  assert.equal(call.listenerCount("drain"), 1);
  call.emit("drain");
  assert.deepEqual(actions, ["scheduled", "periodic"]);
  assert.equal(gate.blocked, false);
  gate.afterWrite(false, "scheduled", () => actions.push("should-not-run"));
  gate.close();
  assert.equal(call.listenerCount("drain"), 0);
  call.emit("drain");
  assert.equal(actions.includes("should-not-run"), false);
});

test("autosave exits after a failed IPC acknowledgement, retains pending snapshot and retries on next enqueue", () => {
  const testScript = `
    import { createWorkspaceAutosaveState, enqueueWorkspaceAutosave } from './app/playground/features/workspace/workspace-autosave.ts';
    const state = createWorkspaceAutosaveState();
    const bundle = { project: { mockServer: { id: 10 } }, layout: {}, settings: {} };
    let calls = 0, fail = true;
    globalThis.window = { electronWorkspace: { saveFolder: async () => {
      calls++;
      if (fail) return { ok: false, error: 'disk full' };
      return { ok: true };
    } } };
    let rejected = false;
    try { await enqueueWorkspaceAutosave(state, bundle, '/workspace-a'); }
    catch (error) { rejected = /disk full/.test(error.message); }
    if (!rejected || calls !== 1 || !state.pendingBundle || state.saving) throw new Error('failed autosave was not retained exactly once');
    fail = false;
    await enqueueWorkspaceAutosave(state, bundle, '/workspace-a');
    if (calls !== 2 || state.pendingBundle || state.lastPath !== '/workspace-a') throw new Error('pending autosave did not retry');
    console.log('autosave-retry-ok');
  `;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", testScript], {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /autosave-retry-ok/);
});

test("workspace switch is protected when a previous save remains pending", () => {
  const content = fs.readFileSync(path.join(root, "app/playground/features/workspace/use-workspace-controller.ts"), "utf8");
  assert.match(content, /if \(autosave\.pendingBundle \|\| autosave\.saving\)/);
  assert.match(content, /mockCatalogStore\.dispose\(\)/);
  assert.match(content, /clearParsedMockMethodFileCache\(\)/);
});

test("gateway capture memory has a byte budget even when messages are very large", () => {
  const vm = require("node:vm");
  const source = fs.readFileSync(path.join(root, "electron/services/grpc-gateway-server.cjs"), "utf8");
  const start = source.indexOf("function retainCapture(runtime, capture)");
  const end = source.indexOf("function scheduleRuntimeStatusWrite(runtime)", start);
  assert.ok(start > 0 && end > start);
  const context = {
    maxInMemoryCaptures: 40,
    maxInMemoryCaptureBytes: 128,
    estimateBytes: (value) => Buffer.byteLength(JSON.stringify(value)),
  };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.retain = retainCapture;`, context);
  const runtime = { captures: [], captureSizes: [], captureBytes: 0 };
  context.retain(runtime, { id: "oversized", data: "x".repeat(1000) });
  assert.equal(runtime.captures.length, 0);
  for (let i = 0; i < 1000; i++) context.retain(runtime, { id: i, data: "xy" });
  assert.ok(runtime.captureBytes <= 128);
  assert.equal(runtime.captures.length, runtime.captureSizes.length);
});

test("evicted gateway captures can be reloaded from persisted workspace YAML", async () => {
  const vm = require("node:vm");
  const fsp = require("node:fs/promises");
  const os = require("node:os");
  const { stringifyYaml, parseYaml } = require("../lib/workspace-yaml.cjs");
  const source = fs.readFileSync(path.join(root, "electron/services/grpc-gateway-server.cjs"), "utf8");
  const start = source.indexOf("async function readCaptureFromDisk(runtime, captureId)");
  const end = source.indexOf("function createGatewayHandler(runtime, method", start);
  assert.ok(start > 0 && end > start);
  const context = { fsp, path, parseYaml, safeSegment: (value) => String(value).replace(/[^a-zA-Z0-9._-]/g, "-") };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.readCapture = readCaptureFromDisk;`, context);
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "layang-capture-reload-"));
  const id = "a5b2c3d4-ff12-4400-8800-111111111111";
  try {
    const captureDir = path.join(dir, ".layang", "proxy-captures", "gateway-a", "svc-Watch");
    await fsp.mkdir(captureDir, { recursive: true });
    await fsp.writeFile(path.join(captureDir, `date-${id.slice(0, 8)}.yml`), stringifyYaml({ version: 1, capture: { id, data: { ok: true } } }));
    const loaded = await context.readCapture({ workspaceDirectory: dir, id: "gateway-a" }, id);
    assert.equal(loaded?.id, id);
    assert.equal(loaded?.data?.ok, true);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
