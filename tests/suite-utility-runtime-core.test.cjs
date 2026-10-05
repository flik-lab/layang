"use strict";

const { createRequire: __suiteCreateRequire } = require("node:module");
const __suitePath = require("node:path");
const __suiteBaseDir = __dirname;


{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "disposable-transport-runtime-manager.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("disposable-transport-runtime-manager.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    
    const { createDisposableTransportRuntimeManager } = require("../electron/runtime/disposable-transport-runtime-manager.cjs");
    
    function createFakeHostFactory() {
      const hosts = [];
      let generation = 0;
      const factory = () => {
        generation += 1;
        const listeners = new Set();
        const calls = [];
        const host = {
          id: generation,
          disposed: false,
          calls,
          async start() { return { running: true, generation: `g-${generation}` }; },
          async invoke(type, payload) {
            calls.push({ type, payload });
            if (type === "grpcWeb.invoke") {
              const documentRef = { id: `transport:run-a:message:${generation}`, preview: "{}", originalChars: 2 };
              for (const listener of listeners) listener({ protocolVersion: 1, type: "event", event: "grpcWeb.message", payload: { runId: payload.runId, documentRef } });
              return { httpStatus: 200, headers: {}, trailers: { "grpc-status": "0" }, messages: ["{}"], messageDocumentRefs: [documentRef], durationMs: 1, requestUrl: payload.url, transport: "grpc-web" };
            }
            if (type === "payload.getLines") return [`line-from-host-${generation}`];
            if (type === "payload.debugStats") return { documentCount: 1, decodedDocumentCount: 0, indexedDocumentCount: 0, pinnedDocumentCount: 0, rawBytes: 2, indexBytes: 0, residentBytes: 2 };
            if (type === "grpcWeb.cancel") return { cancelled: true };
            return { ok: true };
          },
          subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
          getStatus() { return { running: !host.disposed, generation: `g-${generation}` }; },
          async dispose() { host.disposed = true; },
        };
        hosts.push(host);
        return host;
      };
      return { factory, hosts };
    }
    
    test("starting the same run again disposes the old transport generation", async () => {
      const fake = createFakeHostFactory();
      const manager = createDisposableTransportRuntimeManager({ createHost: fake.factory, eventFlushMs: 1 });
    
      await manager.invoke("run-a", { runId: "run-a", url: "http://localhost/a" }, () => undefined);
      assert.equal(fake.hosts.length, 1);
      assert.equal(fake.hosts[0].disposed, false);
    
      await manager.invoke("run-a", { runId: "run-a", url: "http://localhost/b" }, () => undefined);
      assert.equal(fake.hosts.length, 2);
      assert.equal(fake.hosts[0].disposed, true);
      assert.equal(fake.hosts[1].disposed, false);
    
      await manager.disposeAll();
    });
    
    test("cancel terminates the transport process and forgets its documents", async () => {
      const fake = createFakeHostFactory();
      const manager = createDisposableTransportRuntimeManager({ createHost: fake.factory, eventFlushMs: 1 });
      const batches = [];
    
      const result = await manager.invoke("run-a", { runId: "run-a", url: "http://localhost/a" }, (events) => batches.push(events));
      const documentId = result.messageDocumentRefs[0].id;
      await new Promise((resolve) => setTimeout(resolve, 5));
      assert.deepEqual(await manager.invokePayload("payload.getLines", { id: documentId, start: 0, count: 1 }), ["line-from-host-1"]);
    
      const cancelled = await manager.cancel("run-a");
      assert.equal(cancelled.cancelled, true);
      assert.equal(fake.hosts[0].disposed, true);
      await assert.rejects(() => manager.invokePayload("payload.getLines", { id: documentId, start: 0, count: 1 }), /transport document is no longer available/i);
      await manager.disposeAll();
    });
    
    test("non-terminal transport events are batched and terminal events flush immediately", async () => {
      const fake = createFakeHostFactory();
      const manager = createDisposableTransportRuntimeManager({ createHost: fake.factory, eventFlushMs: 5 });
      const batches = [];
    
      await manager.invoke("run-a", { runId: "run-a", url: "http://localhost/a" }, (events) => batches.push(events));
      await new Promise((resolve) => setTimeout(resolve, 10));
    
      assert.ok(batches.length >= 1);
      assert.ok(batches.flat().some((event) => event.type === "message"));
      await manager.disposeAll();
    });
    
    
    test("document owner routing stays bounded to the runtime retention window", async () => {
      const listeners = new Set();
      const host = {
        async start() { return { running: true, generation: "g-bounded" }; },
        async invoke(type, payload) {
          if (type === "grpcWeb.invoke") {
            const refs = [];
            for (let index = 0; index < 12; index += 1) {
              const documentRef = { id: `transport:${payload.runId}:message:${index + 1}`, preview: "{}", originalChars: 300_000 };
              refs.push(documentRef);
              for (const listener of listeners) listener({
                protocolVersion: 1,
                type: "event",
                event: "grpcWeb.message",
                payload: { runId: payload.runId, documentRef, retentionLimit: 5 },
              });
            }
            return { httpStatus: 200, messages: refs.map(() => "{}"), messageDocumentRefs: refs, trailers: { "grpc-status": "0" } };
          }
          if (type === "payload.debugStats") return { documentCount: 5, decodedDocumentCount: 0, indexedDocumentCount: 0, pinnedDocumentCount: 0, rawBytes: 10, decodedChars: 0, indexBytes: 0, residentBytes: 10 };
          return { ok: true };
        },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        getStatus() { return { running: true, generation: "g-bounded" }; },
        async dispose() {},
      };
      const manager = createDisposableTransportRuntimeManager({ createHost: () => host, eventFlushMs: 1 });
      await manager.invoke("run-bounded", { runId: "run-bounded", url: "http://localhost/a" }, () => undefined);
      assert.equal(manager.getStatus().documentCount, 5);
      await manager.disposeAll();
    });
    
    test("retention updates propagate to active and future transport generations", async () => {
      const fake = createFakeHostFactory();
      const manager = createDisposableTransportRuntimeManager({ createHost: fake.factory, eventFlushMs: 1 });
    
      await manager.invokePayload("payload.setRetentionLimit", { limit: 50 });
      await manager.invoke("run-a", { runId: "run-a", url: "http://localhost/a" }, () => undefined);
    
      assert.deepEqual(fake.hosts[0].calls[0], { type: "payload.setRetentionLimit", payload: { limit: 50 } });
      assert.equal(manager.getStatus().runs[0].runId, "run-a");
    
      await manager.invokePayload("payload.setRetentionLimit", { limit: 20 });
      assert.ok(fake.hosts[0].calls.some((call) => call.type === "payload.setRetentionLimit" && call.payload.limit === 20));
    
      await manager.invoke("run-b", { runId: "run-b", url: "http://localhost/b" }, () => undefined);
      assert.deepEqual(fake.hosts[1].calls[0], { type: "payload.setRetentionLimit", payload: { limit: 20 } });
      await manager.disposeAll();
    });
    
    
    test("HTTPS transport generations inherit Layang TLS settings while HTTP stays unchanged", async () => {
      const created = [];
      const createHost = (context = {}) => {
        created.push(context);
        const listeners = new Set();
        return {
          async start() { return { running: true, generation: "tls-test" }; },
          async invoke(type, _payload) {
            if (type === "grpcWeb.invoke") return { httpStatus: 200, headers: {}, trailers: { "grpc-status": "0" }, messages: [], messageDocumentRefs: [] };
            if (type === "payload.debugStats") return { documentCount: 0, decodedDocumentCount: 0, indexedDocumentCount: 0, pinnedDocumentCount: 0, rawBytes: 0, decodedChars: 0, indexBytes: 0, residentBytes: 0 };
            return { ok: true };
          },
          subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
          getStatus() { return { running: true, generation: "tls-test" }; },
          async dispose() {},
        };
      };
      const manager = createDisposableTransportRuntimeManager({
        createHost,
        getTlsEnvironment: () => ({ NODE_EXTRA_CA_CERTS: "C:/layang/ca.pem", NODE_TLS_REJECT_UNAUTHORIZED: "0" }),
      });
    
      await manager.invoke("https-run", { url: "https://gateway.local/service" }, () => undefined);
      await manager.invoke("http-run", { url: "http://gateway.local/service" }, () => undefined);
    
      assert.deepEqual(created[0].env, { NODE_EXTRA_CA_CERTS: "C:/layang/ca.pem", NODE_TLS_REJECT_UNAUTHORIZED: "0" });
      assert.deepEqual(created[1].env, {});
      await manager.disposeAll();
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "runtime-electron-wiring-regression.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("runtime-electron-wiring-regression.test.cjs", () => {
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const test = require("node:test");
    
    const read = (file) => fs.readFileSync(file, "utf8");
    
    test("electron main owns one utility runtime host lifecycle", () => {
      const source = read("electron/main.cjs");
      assert.match(source, /createUtilityRuntimeHost/);
      assert.match(source, /registerRuntimeIpc/);
      assert.match(source, /utilityRuntimeHost\s*=\s*createUtilityRuntimeHost/);
      assert.match(source, /await utilityRuntimeHost\.start\(\)/);
      assert.match(source, /utilityRuntimeHost\?\.dispose\(\)/);
    });
    
    test("preload exposes minimal utility runtime control plane", () => {
      const source = read("electron/preload.cjs");
      assert.match(source, /exposeInMainWorld\("electronRuntime"/);
      assert.match(source, /ping:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("runtime:ping"\)/);
      assert.match(source, /getStatus:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("runtime:status"\)/);
      assert.match(source, /ipcRenderer\.on\("runtime:event"/);
    });
    
    test("electron declarations type the utility runtime API", () => {
      const source = read("types/electron.d.ts");
      assert.match(source, /electronRuntime\?:\s*\{/);
      assert.match(source, /ping:\s*\(\)\s*=>\s*Promise<RuntimeProcessStatus>/);
      assert.match(source, /onEvent:\s*\(callback:\s*\(event:\s*RuntimeEventEnvelope\)/);
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "runtime-mock-status-events.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("runtime-mock-status-events.test.cjs", () => {
    const assert = require("node:assert/strict");
    const test = require("node:test");
    
    const { createCommandEnvelope } = require("../lib/runtime/runtime-protocol.cjs");
    const { createRuntimeCore } = require("../lib/runtime/runtime-core.cjs");
    const { createMockRuntime } = require("../lib/runtime/mock/mock-runtime.cjs");
    
    function servicesWithStableGrpcStatus() {
      let status = { running: false };
      return {
        grpc: {
          start: async () => {
            status = { running: true, port: 50055 };
            return status;
          },
          update: async () => status,
          stop: async () => {
            status = { running: false };
            return status;
          },
          status: () => status,
        },
        rest: {
          start: async () => ({ running: false }),
          update: async () => ({ running: false }),
          stop: async () => ({ running: false }),
          status: () => ({ running: false }),
        },
        websocket: {
          start: async () => ({ running: false }),
          update: async () => ({ running: false }),
          send: () => ({ running: false, sent: 0 }),
          stop: async () => ({ running: false }),
          status: () => ({ running: false }),
        },
      };
    }
    
    async function command(core, id, type, payload = null) {
      const response = await core.handle(createCommandEnvelope(id, type, payload));
      assert.equal(response.ok, true, response.error);
      return response.payload;
    }
    
    test("runtime core publishes mock.statusChanged only for semantic status changes", async () => {
      const mockRuntime = createMockRuntime({ services: servicesWithStableGrpcStatus() });
      const core = createRuntimeCore({ mockRuntime });
      const events = [];
      core.subscribe((event) => events.push(event));
    
      await command(core, "1", "mock.grpc.start", {});
      await command(core, "2", "mock.grpc.status");
      await command(core, "3", "mock.grpc.update", {});
      await command(core, "4", "mock.grpc.stop");
    
      const statusEvents = events.filter((event) => event.event === "mock.statusChanged");
      assert.equal(statusEvents.length, 2);
      assert.deepEqual(statusEvents[0].payload, {
        protocol: "grpc",
        status: { running: true, port: 50055 },
      });
      assert.deepEqual(statusEvents[1].payload, {
        protocol: "grpc",
        status: { running: false },
      });
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "runtime-payload-document-store.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("runtime-payload-document-store.test.cjs", () => {
    const test = require("node:test");
    const assert = require("node:assert/strict");
    
    const { createPayloadDocumentStore } = require("../lib/runtime/payload/payload-document-store.cjs");
    
    test("runtime payload store defaults to 10 documents regardless of payload size", () => {
      const store = createPayloadDocumentStore({ largeThresholdChars: 250_000 });
      for (let index = 0; index < 12; index += 1) {
        const text = JSON.stringify({ index, name: `small-${index}` });
        store.registerUtf8(`small-${index}`, Buffer.from(text), text.slice(0, 32), text.length);
      }
      assert.equal(store.debugStats().documentCount, 10);
    
      const large = JSON.stringify({ tracks: Array.from({ length: 12_000 }, (_, index) => ({ index, name: `track-${index}` })) });
      assert.ok(large.length >= 250_000);
      for (let index = 0; index < 8; index += 1) {
        store.registerUtf8(`large-${index}`, Buffer.from(large), large.slice(0, 64), large.length);
      }
      assert.equal(store.debugStats().documentCount, 10);
    });
    
    test("runtime payload store lazily exposes metadata, lines, text and search", () => {
      const store = createPayloadDocumentStore();
      const raw = JSON.stringify({ alpha: 1, nested: { bravo: "needle", list: [1, 2, 3] } });
      const ref = store.registerUtf8("doc-1", Buffer.from(raw), raw.slice(0, 12), raw.length);
      assert.deepEqual(ref, { id: "doc-1", preview: raw.slice(0, 12), originalChars: raw.length });
    
      const meta = store.getMeta("doc-1");
      assert.ok(meta.lineCount > 1);
      assert.equal(meta.originalChars, raw.length);
      assert.ok(store.getLines("doc-1", 0, 20).some((line) => line.includes('"alpha": 1')));
      assert.equal(store.getText("doc-1", "raw"), raw);
      assert.ok(store.getText("doc-1", "pretty").includes('"bravo": "needle"'));
      assert.ok(store.search(["doc-1"], "needle", 10).some((match) => match.documentId === "doc-1"));
    });
    
    test("pinned runtime payload document survives retention until unpinned", () => {
      const store = createPayloadDocumentStore({ defaultMaxDocuments: 2 });
      store.registerUtf8("pinned", Buffer.from('{"value":1}'), "", 11);
      store.pin("pinned");
      store.registerUtf8("two", Buffer.from('{"value":2}'), "", 11);
      store.registerUtf8("three", Buffer.from('{"value":3}'), "", 11);
      assert.ok(store.getMeta("pinned"));
      store.unpin("pinned");
      store.registerUtf8("four", Buffer.from('{"value":4}'), "", 11);
      store.registerUtf8("five", Buffer.from('{"value":5}'), "", 11);
      assert.equal(store.getMeta("pinned"), null);
    });
    
    test("runtime payload retention can be reconfigured dynamically and preserves pinned documents", () => {
      const { createPayloadDocumentStore } = require("../lib/runtime/payload/payload-document-store.cjs");
      const store = createPayloadDocumentStore({ defaultMaxDocuments: 10, largeMaxDocuments: 10 });
    
      for (let index = 1; index <= 10; index += 1) {
        store.registerValue(`doc-${index}`, { index });
      }
      store.pin("doc-1");
      store.setRetentionLimit(5);
    
      assert.equal(store.debugStats().maxDocuments, 5);
      assert.equal(store.has("doc-1"), true);
      assert.equal(store.debugStats().documentCount, 5);
      assert.equal(store.has("doc-10"), true);
    
      store.unpin("doc-1");
      assert.equal(store.debugStats().documentCount, 5);
      assert.equal(store.has("doc-1"), true);
    
      store.setRetentionLimit(20);
      assert.equal(store.debugStats().maxDocuments, 20);
      store.dispose();
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "runtime-protocol.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("runtime-protocol.test.cjs", () => {
    const assert = require("node:assert/strict");
    const test = require("node:test");
    
    const {
      RUNTIME_PROTOCOL_VERSION,
      createCommandEnvelope,
      validateCommandEnvelope,
    } = require("../lib/runtime/runtime-protocol.cjs");
    
    test("runtime protocol creates and validates a versioned command envelope", () => {
      const envelope = createCommandEnvelope("runtime:1", "runtime.ping", { value: 1 });
    
      assert.equal(envelope.protocolVersion, RUNTIME_PROTOCOL_VERSION);
      assert.equal(envelope.requestId, "runtime:1");
      assert.equal(envelope.type, "runtime.ping");
      assert.deepEqual(envelope.payload, { value: 1 });
      assert.deepEqual(validateCommandEnvelope(envelope), envelope);
    });
    
    test("runtime protocol rejects unsupported versions", () => {
      assert.throws(
        () =>
          validateCommandEnvelope({
            protocolVersion: RUNTIME_PROTOCOL_VERSION + 1,
            requestId: "runtime:2",
            type: "runtime.ping",
            payload: null,
          }),
        /Unsupported runtime protocol version/,
      );
    });
    
    test("runtime protocol rejects malformed command envelopes", () => {
      assert.throws(
        () =>
          validateCommandEnvelope({
            protocolVersion: RUNTIME_PROTOCOL_VERSION,
            requestId: "",
            type: "runtime.ping",
          }),
        /requestId/,
      );
    
      assert.throws(
        () =>
          validateCommandEnvelope({
            protocolVersion: RUNTIME_PROTOCOL_VERSION,
            requestId: "runtime:3",
            type: "",
          }),
        /type/,
      );
    });
    
  });
}

{
  const __suiteOrigin = __suitePath.resolve(__suiteBaseDir, "utility-runtime-host.test.cjs");
  const require = __suiteCreateRequire(__suiteOrigin);
  const __dirname = __suitePath.dirname(__suiteOrigin);
  const __filename = __suiteOrigin;
  const { describe: __suiteDescribe } = require("node:test");
  __suiteDescribe("utility-runtime-host.test.cjs", () => {
    const assert = require("node:assert/strict");
    const { EventEmitter } = require("node:events");
    const test = require("node:test");
    
    const { createRuntimeCore } = require("../lib/runtime/runtime-core.cjs");
    const { createUtilityRuntimeHost } = require("../electron/runtime/utility-runtime-host.cjs");
    
    class FakePort extends EventEmitter {
      constructor() {
        super();
        this.peer = null;
        this.closed = false;
      }
    
      postMessage(data) {
        if (this.closed || !this.peer) return;
        queueMicrotask(() => this.peer.emit("message", { data, ports: [] }));
      }
    
      start() {}
    
      close() {
        this.closed = true;
      }
    }
    
    function createPortPair() {
      const port1 = new FakePort();
      const port2 = new FakePort();
      port1.peer = port2;
      port2.peer = port1;
      return { port1, port2 };
    }
    
    function createFakeUtilityEnvironment() {
      const child = new EventEmitter();
      child.killCount = 0;
      child.kill = () => {
        child.killCount += 1;
        child.emit("exit", 0);
        return true;
      };
    
      const utilityProcess = {
        fork: () => child,
      };
    
      class FakeMessageChannelMain {
        constructor() {
          Object.assign(this, createPortPair());
        }
      }
    
      child.postMessage = (message, transfer) => {
        if (message?.type !== "runtime.attach") return;
        const childPort = transfer?.[0];
        assert.ok(childPort, "host must transfer a runtime port");
        const core = createRuntimeCore();
        childPort.on("message", async (event) => {
          const response = await core.handle(event.data);
          childPort.postMessage(response);
        });
        core.subscribe((runtimeEvent) => childPort.postMessage(runtimeEvent));
        childPort.start();
        childPort.postMessage({
          protocolVersion: 1,
          type: "event",
          event: "runtime.ready",
          payload: { status: "ready" },
        });
      };
    
      return { child, utilityProcess, MessageChannelMain: FakeMessageChannelMain };
    }
    
    test("utility runtime host becomes ready once and answers runtime ping", async () => {
      const { child, utilityProcess, MessageChannelMain } = createFakeUtilityEnvironment();
      const events = [];
      const host = createUtilityRuntimeHost({
        utilityProcess,
        MessageChannelMain,
        entryPath: "/fake/utility-runtime-entry.cjs",
        readyTimeoutMs: 500,
      });
      host.subscribe((event) => events.push(event));
    
      await host.start();
      const result = await host.invoke("runtime.ping", { source: "test" });
    
      assert.equal(result.status, "ready");
      assert.equal(events.filter((event) => event.event === "runtime.ready").length, 1);
      assert.equal(host.getStatus().running, true);
    
      await host.dispose();
      assert.equal(child.killCount, 1);
      assert.equal(host.getStatus().running, false);
    });
    
  });
}
