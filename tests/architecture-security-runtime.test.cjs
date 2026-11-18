"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const fs = require("node:fs");
const { assertTrustedIpcSender, rendererPolicy } = require("../electron/utils/ipc-security-policy.cjs");
const { createGuardedIpcMain } = require("../electron/utils/ipc-handler-gate.cjs");
const { createUtilityRuntimeHost } = require("../electron/runtime/utility-runtime-host.cjs");

function ipcFixture() {
  const handlers = new Map();
  const listeners = new Map();
  return {
    handlers, listeners,
    handle(channel, fn) { handlers.set(channel, fn); },
    on(channel, fn) { listeners.set(channel, fn); },
  };
}

function senderFixture(url) {
  const win = { id: 17, isDestroyed: () => false };
  const frame = { url };
  const sender = { mainFrame: frame, getURL: () => url, isDestroyed: () => false };
  const event = { sender, senderFrame: frame };
  const options = {
    windowFromWebContents: (value) => value === sender ? win : null,
    isManagedWindow: (value) => value === win,
    policy: { isDev: true, startUrl: "http://localhost:12999/playground" },
  };
  return { win, frame, sender, event, options };
}

test("privileged IPC accepts only a registered Layang main frame", () => {
  const f = senderFixture("http://localhost:12999/playground");
  assert.equal(assertTrustedIpcSender(f.event, "workspace:open-folder", f.options), f.win);
  assert.throws(() => assertTrustedIpcSender({ ...f.event, senderFrame: { url: f.frame.url } }, "git:discard", f.options), /untrusted/);
  assert.throws(() => assertTrustedIpcSender(f.event, "git:discard", { ...f.options, isManagedWindow: () => false }), /unmanaged/);
  f.frame.url = "https://attacker.invalid/";
  assert.throws(() => assertTrustedIpcSender(f.event, "git:discard", f.options), /untrusted renderer origin/);
});

test("IPC origin enforcement denies stale navigation and unexpected file paths", () => {
  const f = senderFixture("http://localhost:12999/playground");
  f.sender.getURL = () => "http://localhost:12999/other-frame";
  assert.throws(() => assertTrustedIpcSender(f.event, "cli:run", f.options), /stale/);
  const out = path.join(process.cwd(), "out", "playground.html");
  const packaged = senderFixture(`file://${out}`);
  packaged.options.policy = { isDev: false, staticIndexPath: out };
  assert.equal(assertTrustedIpcSender(packaged.event, "workspace:open-folder", packaged.options), packaged.win);
  packaged.frame.url = "file:///tmp/attacker.html";
  assert.throws(() => assertTrustedIpcSender(packaged.event, "workspace:open-folder", packaged.options), /untrusted renderer origin/);
  assert.equal(rendererPolicy({ isPackaged: true }).isDev, false);
});

test("all registered IPC handlers are passed through the guarded wrapper", async () => {
  const raw = ipcFixture();
  let called = 0;
  const secure = createGuardedIpcMain(raw, (event) => { if (event?.allow !== true) throw new Error("denied"); });
  secure.handle("git:discard", async () => { called += 1; return "ok"; });
  secure.on("native-grpc:payload-port", () => { called += 1; });
  assert.throws(() => raw.handlers.get("git:discard")({ allow: false }), /denied/);
  assert.equal(await raw.handlers.get("git:discard")({ allow: true }), "ok");
  raw.listeners.get("native-grpc:payload-port")({ allow: false });
  raw.listeners.get("native-grpc:payload-port")({ allow: true });
  assert.equal(called, 2);
});

test("all main and IPC modules register through guarded IPC API", () => {
  const paths = ["electron/main.cjs", ...fs.readdirSync("electron/ipc").filter((name) => name.endsWith(".cjs")).map((name) => `electron/ipc/${name}`)];
  for (const name of paths) {
    const source = fs.readFileSync(name, "utf8");
    if (!/ipcMain\.(?:handle|on)\(/.test(source)) continue;
    if (name.endsWith("grpc-scenario-store-ipc.cjs")) {
      assert.match(fs.readFileSync("electron/main.cjs", "utf8"), /registerGrpcScenarioStoreIpc\(ipcMain/);
    } else {
      assert.match(source, /trusted-ipc-main\.cjs/, `Unprotected IPC registration: ${name}`);
    }
  }
});

class Port extends EventEmitter {
  constructor() { super(); this.peer = null; this.closed = false; }
  postMessage(data) { if (!this.closed && this.peer) queueMicrotask(() => this.peer.emit("message", { data })); }
  start() {}
  close() { this.closed = true; }
}
function ports() {
  const a = new Port(); const b = new Port(); a.peer = b; b.peer = a;
  return { port1: a, port2: b };
}
function fakeRuntime() {
  const forks = [];
  const utilityProcess = { fork: () => {
    const child = new EventEmitter();
    child.pid = 4000 + forks.length;
    child.kill = () => { child.emit("exit", 0); };
    child.postMessage = (_data, transferred) => {
      const port = transferred[0];
      port.on("message", (ev) => {
        if (ev.data.type === "runtime.dispose") {
          port.postMessage({ protocolVersion: 1, requestId: ev.data.requestId, type: "response", ok: true, payload: {} });
          return;
        }
        if (ev.data.type !== "test.never") port.postMessage({ protocolVersion: 1, requestId: ev.data.requestId, type: "response", ok: true, payload: "ack" });
      });
      port.postMessage({ protocolVersion: 1, type: "event", event: "runtime.ready", payload: {} });
    };
    forks.push(child);
    return child;
  } };
  class Channel { constructor() { Object.assign(this, ports()); } }
  return { utilityProcess, MessageChannelMain: Channel, forks };
}

test("utility command timeout clears pending and ignores late acknowledgements", async () => {
  const env = fakeRuntime();
  const host = createUtilityRuntimeHost({ ...env, commandTimeoutMs: 100, maxPendingCommands: 1, readyTimeoutMs: 300 });
  await host.start();
  const slow = host.invoke("test.never");
  await assert.rejects(host.invoke("test.second"), /pending-command limit/);
  await assert.rejects(slow, /timed out/);
  assert.equal(host.getStatus().pendingCommandCount, 0);
  assert.equal(await host.invoke("test.echo"), "ack");
  await host.dispose();
  assert.equal(host.getStatus().pendingCommandCount, 0);
});

test("renderer generic runtime facade has a strict command allowlist", () => {
  // The runtime IPC requires Electron; test the exported policy using an isolated module mock.
  const Module = require("node:module");
  const modPath = require.resolve("../electron/ipc/runtime-ipc.cjs");
  const originalLoad = Module._load;
  try {
    Module._load = function(id, ...rest) {
      if (id === "electron") return { BrowserWindow: { getAllWindows: () => [] } };
      if (id === "../utils/trusted-ipc-main.cjs") return { ipcMain: { handle() {} } };
      return originalLoad.call(this, id, ...rest);
    };
    delete require.cache[modPath];
    const { assertRendererRuntimeCommand } = require(modPath);
    assert.equal(assertRendererRuntimeCommand("payload.getLines"), "payload.getLines");
    assert.throws(() => assertRendererRuntimeCommand("runtime.dispose"), /Unsupported/);
    assert.throws(() => assertRendererRuntimeCommand("mock.grpc.stop"), /Unsupported/);
    assert.throws(() => assertRendererRuntimeCommand("payload.unknown"), /Unsupported/);
  } finally {
    Module._load = originalLoad;
    delete require.cache[modPath];
  }
});

const { createRestRequestTransport, normalizeRestRequest } = require("../electron/services/rest-request-transport.cjs");

test("secure REST bridge normalizes only HTTP(S) and bounds request data", () => {
  assert.throws(() => normalizeRestRequest({ url: "file:///etc/passwd" }), /HTTP and HTTPS/);
  assert.throws(() => normalizeRestRequest({ url: "http://localhost", method: "GET", body: "data" }), /cannot contain/);
  assert.throws(() => normalizeRestRequest({ url: "http://localhost", method: "POST", body: "x".repeat(16 * 1024 * 1024 + 1) }), /exceeds/);
  assert.equal(normalizeRestRequest({ url: "http://localhost:1234/path", method: "POST", body: "ok" }).method, "POST");
});

test("secure REST bridge returns HTTP status, headers and text without renderer fetch", async () => {
  const transport = createRestRequestTransport({ fetcher: async (url, options) => {
    assert.equal(url, "https://example.invalid/api");
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "omit");
    assert.equal(options.body, "hello");
    return new Response(JSON.stringify({ ok: true }), { status: 201, headers: { "content-type": "application/json" } });
  } });
  const result = await transport.invoke({ url: "https://example.invalid/api", method: "POST", body: "hello" });
  assert.equal(result.status, 201);
  assert.equal(result.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(result.body), { ok: true });
});

test("secure REST bridge aborts oversized responses and propagates cancellation", async () => {
  const large = createRestRequestTransport({ maxResponseBytes: 4, fetcher: async () => new Response("payload too big") });
  await assert.rejects(large.invoke({ url: "http://localhost" }), /configured memory limit/);
  const aborter = new AbortController();
  const long = createRestRequestTransport({ timeoutMs: 500, fetcher: async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }) });
  const task = long.invoke({ url: "http://localhost" }, aborter.signal);
  aborter.abort();
  await assert.rejects(task, /Abort/);
});

test("renderer retains Chromium web security and routes desktop REST over IPC", () => {
  const windowSource = fs.readFileSync("electron/window/create-window.cjs", "utf8");
  const runnerSource = fs.readFileSync("app/playground/hooks/use-request-runner.ts", "utf8");
  assert.match(windowSource, /webSecurity:\s*true/);
  assert.match(runnerSource, /fetchRestResponse\(requestUrl\.toString\(\)/);
  assert.match(runnerSource, /window\.electronHttp/);
  assert.match(fs.readFileSync("electron/preload.cjs", "utf8"), /rest-transport:invoke/);
});

const { createGatewayMockStreamScheduler } = require("../lib/gateway-mock-stream-scheduler.cjs");

test("Gateway mock stream blocks rather than buffering 10k sends under backpressure", async () => {
  const call = new EventEmitter();
  let sends = 0;
  let completed = 0;
  call.write = () => { sends += 1; return sends !== 1; };
  const task = createGatewayMockStreamScheduler({
    call,
    responses: Array.from({ length: 10_000 }, (_, i) => ({ data: { i } })),
    intervalMs: 0,
    mapItem: (item) => ({ data: item.data }),
    onComplete() { completed += 1; },
    onError(error) { throw error; },
  });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(sends, 1);
  assert.equal(task.getState().waitingForDrain, true);
  call.emit("cancelled");
  assert.equal(task.getState().closed, true);
  assert.equal(call.listenerCount("drain"), 0);
  assert.equal(call.listenerCount("cancelled"), 0);
  assert.equal(completed, 0);
});

test("Gateway mock stream resumes after drain and releases resources on completion", async () => {
  const call = new EventEmitter();
  let sends = 0;
  let done = 0;
  call.write = () => ++sends > 1;
  const task = createGatewayMockStreamScheduler({
    call, responses: [{ data: { id: 1 } }, { data: { id: 2 } }], intervalMs: 0,
    mapItem: (item) => ({ data: item.data }),
    onComplete() { done += 1; },
    onError(error) { throw error; },
  });
  assert.equal(sends, 1);
  call.emit("drain");
  // Two zero-delay timer hops; on Windows each can take a full ~15 ms timer tick under load.
  for (const started = Date.now(); done === 0 && Date.now() - started < 1000; )
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(sends, 2);
  assert.equal(done, 1);
  assert.equal(task.getState().closed, true);
  assert.equal(call.listenerCount("close"), 0);
});

test("REST IPC cancellation is scoped to the calling renderer window", async () => {
  const Module = require("node:module");
  const modPath = require.resolve("../electron/ipc/rest-transport-ipc.cjs");
  const registered = ipcFixture();
  const originalLoad = Module._load;
  try {
    Module._load = function(id, ...rest) {
      if (id === "electron") return { net: { fetch() {} } };
      if (id === "../utils/trusted-ipc-main.cjs") return { ipcMain: registered };
      return originalLoad.call(this, id, ...rest);
    };
    delete require.cache[modPath];
    const { registerRestTransportIpc } = require(modPath);
    registerRestTransportIpc({
      transport: { invoke: (_request, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }) },
    });
    const senderOne = Object.assign(new EventEmitter(), { id: 1 });
    const senderTwo = Object.assign(new EventEmitter(), { id: 2 });
    const request = registered.handlers.get("rest-transport:invoke")({ sender: senderOne }, { runId: "run-1" });
    await Promise.resolve();
    assert.deepEqual(registered.handlers.get("rest-transport:cancel")({ sender: senderTwo }, { runId: "run-1" }), { cancelled: false });
    assert.deepEqual(registered.handlers.get("rest-transport:cancel")({ sender: senderOne }, { runId: "run-1" }), { cancelled: true });
    await assert.rejects(request, /Abort/);
    assert.equal(senderOne.listenerCount("destroyed"), 0);
  } finally {
    Module._load = originalLoad;
    delete require.cache[modPath];
  }
});
